function putEvents(event, context, cb) {
  const records = event.Records
  if (records.length > 0) {
    console.log(`Handled ${JSON.stringify(records)} successfully!`)
  }

  cb()
}

module.exports = { putEvents }
