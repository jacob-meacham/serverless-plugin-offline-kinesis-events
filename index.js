'use strict';

const _ = require('lodash');
const AWS = require('aws-sdk');
const BB = require('bluebird');

/**
 * Based on ServerlessWebpack.run
 * @param stats
 */
function getRunnableLambda(slsWebpack, stats, functionName) {
    const handler = slsWebpack.loadHandler(stats, functionName);
    const context = slsWebpack.getContext(functionName);

    return (event) => {
        return new BB(
            (resolve, reject) => handler(
                event,
                context,
                (err, res) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(res);
                    }
                }
            ));
    }
}

class ServerlessOfflineKinesisEvents {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;
        // Only meaningful for AWS
        this.provider = 'aws';

        // No commands to run
        // TODO(msills): Allow this to be run independently
        this.commands = {};
        // Run automatically as part of the deploy
        this.hooks = {
            'after:offline:start': () => BB.bind(this).then(this.runWatcher)
        };

        // Registry of streams to lists of functions
        this.registry = null;

    }

    static async createRegistry(serverless) {
        // Get a handle on the compiled functions
        // TODO(msills): Do not rely on this plugin.
        const slsWebpack = _.find(serverless.pluginManager.plugins, (p) => p.constructor.name === 'ServerlessWebpack');
        const compileStats = await slsWebpack.compile();

        let registry = {};
        for (let functionName of _.keys(serverless.service.functions)) {
            const func = serverless.service.functions[functionName];
            // Get the list of streams for the function
            const streamEvents = _.filter(func.events || [], (e) => 'stream' in e);
            for (let s of streamEvents) {
                const streamName = s.stream.arn.split('/').slice(-1)[0];
                registry[streamName] = registry[streamName] || [];
                registry[streamName].push(getRunnableLambda(slsWebpack, compileStats, functionName));
            }
        }
        return registry;
    }

    async runWatcher() {
        // Lazily load the registry
        if (this.registry === null) {
            this.registry = await ServerlessOfflineKinesisEvents.createRegistry(this.serverless);
        }

        // Create the Kinesis client
        const config = this.serverless.service.custom.offlineKinesisEvents;
        const kinesis = new AWS.Kinesis({
            endpoint: config.host + ':' + config.port,
            region: config.region,
            apiVersion: '2013-12-02',
            sslEnabled: config.sslEnabled || false
        });

        // Right now, the stream iterators are local to this run. Eventually, we'll persist this somewhere
        let streamIterators = {};
        // Get the first shard for every element in the registry
        for (let s of _.keys(this.registry)) {
            // Describe the stream
            const stream = await kinesis.describeStream({
                StreamName: s
            }).promise();
            const shardId = stream.StreamDescription.Shards[0].ShardId;
            // Get an iterator for the shard
            const result = await kinesis.getShardIterator({ShardId: shardId, ShardIteratorType: 'TRIM_HORIZON', StreamName: s}).promise();
            streamIterators[s] = result.ShardIterator;
        }

        while (true) {
            this.serverless.cli.log('Polling Kinesis streams: ' + JSON.stringify(_.keys(this.registry)));
            for (let s of _.keys(this.registry)) {
                if (streamIterators[s] === null) {
                    this.serverless.cli.warn("Iterator for stream '" + s + "' is closed");
                }
                // Get all events from the stream
                const result = await kinesis.getRecords({ShardIterator: streamIterators[s], Limit: 100}).promise();
                this.serverless.cli.log('Stream ' + s + ' returned ' + result.Records.length + ' records');
                const records = _.map(result.Records, (r) => JSON.parse(r.Data.toString()));
                // Process the functions
                for (let f of this.registry[s]) {
                    f({Records: records});
                }
                // Record the next iterator
                streamIterators[s] = result.NextShardIterator;
            }
            await BB.delay(config.intervalMillis);

        }
    }
}

module.exports = ServerlessOfflineKinesisEvents;
