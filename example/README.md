# Running the example
Ensure that you've set your aws credentials with the awscli (otherwise, you'll get a connection timeout error when the aws-sdk attempts to connect to the default metadata service)
```
cd ..
npm i && npm run build
cd example
docker run -d -t -p 4567:4567 dlsniper/kinesalite:1.11.4
npm i
npm run dev
npm run dev:putToStream
```

This example does not rely on serverless-webpack; to test with serverless-webpack, add `serverless-webpack` to the list of plugins in `serverless.yml` and run

```
npm run dev:webpack
```
