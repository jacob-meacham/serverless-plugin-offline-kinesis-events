/**
 * Created by msills on 1/16/17.
 */

import * as AWS from 'aws-sdk'
import winston from 'winston'

async function ensureStream() {
  const kinesis = new AWS.Kinesis({
    endpoint: `${process.env.LAMBDA_KINESIS_HOST}:${process.env.LAMBDA_KINESIS_PORT}`,
    region: process.env.LAMBDA_REGION,
    apiVersion: '2013-12-02',
    sslEnabled: false
  })
  try {
    // Create the stream
    await kinesis.createStream({ ShardCount: 1, StreamName: process.env.LAMBDA_KINESIS_STREAM_NAME }).promise()
  } catch (err) {
    if (err.code === 'ResourceInUseException') {
      // Stream already exists, so no problem
      winston.info('Kinesis stream already exists')
      return
    }
    throw err
  }
}

async function bootstrap() {
  // Create the Kinesis stream
  winston.info('Creating Kinesis stream')
  await ensureStream()
}

// Run everything
bootstrap()
  .then(() => {
    winston.info('Bootstrap succeeded')
    process.exit(0)
  })
  .catch((err) => {
    winston.error(`Bootstrap failed with error ${err.stack}`)
    process.exit(1)
  })
