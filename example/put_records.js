import AWS from 'aws-sdk'
import BB from 'bluebird'
import fs from 'fs'
import winston from 'winston'
import yaml from 'js-yaml'

const readAsync = BB.promisify(fs.readFile)

winston.level = process.env.LAMBDA_LOG_LEVEL || 'info'

if (process.argv.length < 3) {
  winston.error(`usage: ${__filename.split('/').slice(-1)[0]} [file.yml]`)
  process.exit(1)
}

// const kinesis = 1
const kinesis = new AWS.Kinesis({
  endpoint: `${process.env.LAMBDA_KINESIS_HOST}:${process.env.LAMBDA_KINESIS_PORT}`,
  region: process.env.LAMBDA_REGION,
  apiVersion: '2013-12-02',
  sslEnabled: false
})

// Load the record
async function run() {
  // Read the records
  const records = await BB.all(process.argv.slice(2).map(f => readAsync(f)))
  // Write them to Kinesis
  return BB.map(records, record => kinesis.putRecord({
    Data: JSON.stringify(yaml.safeLoad(record)),
    PartitionKey: '0',
    StreamName: process.env.LAMBDA_KINESIS_STREAM_NAME
  }).promise())
}

run()
  .then(() => winston.info('Put records successfully'))
  .catch((err) => {
    winston.error(`Failed with error ${err.stack}`)
    process.exit(2)
  })
