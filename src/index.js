import * as _ from 'lodash'
import * as AWS from 'aws-sdk'
import BB from 'bluebird'
import winston from 'winston'
import path from 'path'

function wrapHandler(handler, context) {
  return (event) => {
    return new Promise((resolve, reject) => handler(event, context, (err, res) => {
      if (err) {
        reject(err)
      } else {
        resolve(res)
      }
    }))
  }
}

/**
 * Based on ServerlessWebpack.run
 * @param stats
 */
function getWebpackRunnableLambda(slsWebpack, stats, functionName) {
  const handler = slsWebpack.loadHandler(stats, functionName, true)
  const context = slsWebpack.getContext(functionName)
  return wrapHandler(handler, context)
}

function setEnvironmentVars(serverless, functionName) {
  const providerEnvVars = serverless.service.provider.environment || {}
  const functionEnvVars = serverless.service.functions[functionName].environment || {}

  Object.assign(process.env, providerEnvVars, functionEnvVars)
}

function getRunnableLambda(serverless, functionName) {
  const handlerParts = serverless.service.functions[functionName].handler.split('.')

  // TODO: Make this smarter
  const handlerFilePath = path.resolve(process.cwd(), `${handlerParts[0]}.js`)

  setEnvironmentVars(serverless, functionName)

  const module = require(handlerFilePath)
  const functionObjectPath = handlerParts.slice(1)
  let handler = module
  for (let p of functionObjectPath) {
    handler = handler[p]
  }

  return wrapHandler(handler, { })
}

const MAX_CONSECUTIVE_ERRORS = 10

class ServerlessOfflineKinesisEvents {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options

    // Only meaningful for AWS
    this.provider = 'aws'

    // No commands to run
    // TODO(msills): Allow this to be run independently
    this.commands = {}
    // Run automatically as part of the deploy
    this.hooks = {
      'before:offline:start': () => BB.bind(this).then(this.runWatcher)
    }
  }

  /**
   * Based on ServerlessWebpack.run
   * @param stats
   */
  static async createRegistry(serverless) {
    // Get a handle on the compiled functions
    const slsWebpack = _.find(serverless.pluginManager.plugins, p => p.constructor.name === 'ServerlessWebpack')
    let compileStats = null
    if (slsWebpack) {
      compileStats = await slsWebpack.compile()
    }

    const registry = {}
    for (const functionName of _.keys(serverless.service.functions)) {
      const func = serverless.service.functions[functionName]
      // Get the list of streams for the function
      const streamEvents = _.filter(func.events || [], e => 'stream' in e)
      for (const s of streamEvents) {
        const streamName = s.stream.arn.split('/').slice(-1)[0]
        registry[streamName] = registry[streamName] || []
        if (slsWebpack) {
          registry[streamName].push(getWebpackRunnableLambda(slsWebpack, compileStats, functionName))
        } else {
          registry[streamName].push(getRunnableLambda(serverless, functionName))
        }
      }
    }
    return registry
  }

  static async _repollStreams(kinesis, streamIterators) {
    winston.debug(`Polling Kinesis streams: ${JSON.stringify(_.keys(streamIterators))}`)
    for (const name of _.keys(streamIterators)) {
      if (streamIterators[name] === null) {
        winston.warn(`Iterator for stream '${name}' + is closed`)
      }
    }
    // Get the new values for each stream
    // name -> [fetch result]
    return BB.props(
      _.mapValues(
        streamIterators,
        iter => kinesis.getRecords({
          ShardIterator: iter,
          Limit: 100
        }).promise()))
  }

  static async _runLambdas(streamResults, registry) {
    // Wait for the functions to execute
    await BB.all(_.chain(streamResults)
      .entries()
      .flatMap(([name, result]) => {
        winston.debug(`Stream '${name}' returned ${result.Records.length} records`)
        // Parse the records
        const records = _.map(result.Records, r => JSON.parse(r.Data.toString()))
        // Apply the functions that use that stream
        return registry[name].map(f => f({ Records: records }))
      })
      .value())
  }

  async runWatcher() {
    // Create the Kinesis client
    const config = this.serverless.service.custom.offlineKinesisEvents
    const kinesis = new AWS.Kinesis({
      endpoint: `${config.host}:${config.port}`,
      region: config.region,
      apiVersion: '2013-12-02',
      sslEnabled: config.sslEnabled || false
    })

    // Load the registry
    const registry = await ServerlessOfflineKinesisEvents.createRegistry(this.serverless)
    // Get the first shard for every element in the registry
    // Right now, the stream iterators are local to this run. Eventually, we'll persist this somewhere
    let streamIterators = await BB.props(
      _.chain(registry)
      // Grab keys
        .keys()
        // Map to [name, stream description promise]
        .map(name => [name, kinesis.describeStream({ StreamName: name }).promise()])
        // Map to [name, iterator promise]
        .map(([name, descP]) => {
          const iterP = descP.then(desc => kinesis.getShardIterator({
            ShardId: desc.StreamDescription.Shards[0].ShardId,
            ShardIteratorType: 'TRIM_HORIZON',
            StreamName: name
          }).promise())
          return [name, iterP]
        })
        // Back to an object
        .fromPairs()
        // Extract iterators
        .mapValues(iterP => iterP.then(iter => iter.ShardIterator))
        // Grab the value
        .value())

    let consecutiveErrors = 0
    while (true) { // eslint-disable-line no-constant-condition
      winston.debug(`Polling Kinesis streams: ${JSON.stringify(_.keys(registry))}`)
      // Repoll the streams
      const streamResults = await ServerlessOfflineKinesisEvents._repollStreams(kinesis, streamIterators) // eslint-disable-line
      try {
        await ServerlessOfflineKinesisEvents._runLambdas(streamResults, registry) // eslint-disable-line
      } catch (err) {
        consecutiveErrors += 1
        if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
          winston.error(`Exceeded maximum number of consecutive errors (${MAX_CONSECUTIVE_ERRORS})`)
          throw err
        }
        winston.error(`Failed to run Lambdas with error ${err.stack}. Continuing`)
      } finally {
        // Update the stream iterators
        streamIterators = _.mapValues(streamResults, result => result.NextShardIterator)
      }

      // Wait a bit
      await BB.delay(config.intervalMillis) // eslint-disable-line no-await-in-loop
    }
  }
}

module.exports = ServerlessOfflineKinesisEvents
