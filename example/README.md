# Running the example
Ensure that you've set your aws credentials with the awscli (otherwise, you'll get a connection timeout error when the aws-sdk attempts to connect to the default metadata service)
```
cd ..
npm i && npm run build
cd example
npm i
npm run dev
npm run dev:putToStream
```
