'use strict';
console.log('-- Loading zxaws-poc-02 analysis-video-task function --');

// Depend npm modules
const youtubedl = require('youtube-dl');
const log = require('lambda-log');
const moment = require('moment-timezone');
// Depend system modules
const stream = require('stream');
const AWS = require('aws-sdk');
// Global objects & variables
const rekognition = new AWS.Rekognition();
const dynamodb = new AWS.DynamoDB();
// Get evn variables
const VIDEO_CACHE_BUCKET = process.env['S3_BUCKET_VIDEO_CACHE'];
const VIDEO_TASK_DDB_TABLE = process.env['DDB_TABLE_VIDEO_TASK'];
const PYTHON_LIB_PATH = process.env['LAMBDA_TASK_ROOT'] + "/python2/lib";
const PYTHON_BIN_PATH = process.env['LAMBDA_TASK_ROOT'] + "/python2/bin";

function cacheVideoTask(videoTaskData) {
    return new Promise((resolve, reject) => {
        log.debug('Cache videoTaskData: ', videoTaskData);
        let params = {
            Item: {
                "VideoUrl": { S: videoTaskData.url },
                "S3key": { S: videoTaskData.s3key },
                "S3Bucket": { S: VIDEO_CACHE_BUCKET },
                "TimeToLive": { N: videoTaskData.expire.toString() },
                "JobId": { S: videoTaskData.jobId }
            },
            ConditionExpression: "attribute_not_exists(VideoUrl)",
            ReturnConsumedCapacity: "TOTAL"
        };
        params.TableName = VIDEO_TASK_DDB_TABLE;

        dynamodb.putItem(params, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

function uploadVideoObject(objectKey, passtrough) {
    log.debug("Upload video " + objectKey + " to s3 bucket " + VIDEO_CACHE_BUCKET);
    return new Promise((resolve, reject) => {
        const upload = new AWS.S3.ManagedUpload({
            params: {
                Bucket: VIDEO_CACHE_BUCKET,
                Key: objectKey,
                Body: passtrough,
                ContentType: "video/mp4"
            },
            partSize: 1024 * 1024 * 64 // 64 MB in bytes
        });
        upload.send((err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function startLabelDetection(videoTaskData) {
    log.debug("StartLabelDetection on " + videoTaskData.s3key + " in s3 bucket " + VIDEO_CACHE_BUCKET);
    return new Promise((resolve, reject) => {
        let params = {
            Video: {
                S3Object: {
                    Bucket: VIDEO_CACHE_BUCKET,
                    Name: videoTaskData.s3key
                }
            },
            ClientRequestToken: videoTaskData.id
        };
        
        rekognition.startLabelDetection(params, function(err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

exports.handler = async function(event, context) {
    // Set log level first
    log.options.debug = true;
    
    log.debug('Event:', event);
    log.debug('Context:', context);
    log.debug('VIDEO_TASK_DDB_TABLE: ', VIDEO_TASK_DDB_TABLE);
    log.debug('VIDEO_CACHE_BUCKET: ', VIDEO_CACHE_BUCKET);
    
    // Update python env
    process.env['PATH'] = process.env['PATH'] + ':' + PYTHON_BIN_PATH;
    process.env['PYTHONPATH'] = PYTHON_LIB_PATH;
    
    log.debug('process.env PATH: ', process.env['PATH']);
    log.debug('process.env PYTHONPATH: ', process.env['PYTHONPATH']);
    
    for (let i = 0; i < 1; i++) {
        const { body } = event.Records[i];
        log.debug('Sqs record: ', body);
        
        let videoTaskData = JSON.parse(body);
        videoTaskData.s3key = videoTaskData.id + '.mp4';
        
        let currentTime = moment().format();
        //let expireTime = moment(currentTime).add(7, 'days');
        let expireTime = moment(currentTime).add(2, 'minutes');
        let expireEpoch = expireTime.unix();
        videoTaskData.expire = expireEpoch;
        
        //log.debug('currentTime:', currentTime);
        //log.debug('expireTime:', expireTime.format());
        //log.debug('expireEpoch:', expireEpoch);

        // Download video from YouTube
        const passtrough = new stream.PassThrough();
        const dl = youtubedl(videoTaskData.url, ['--format=best[ext=mp4]'], {maxBuffer: Infinity});
        // Write video to the pass-through stream
        dl.pipe(passtrough);
        
        // Upload video file to s3 bucket
        await uploadVideoObject(videoTaskData.s3key, passtrough);
        
        // Start Rekognition video label detection task
        let jobRes = await startLabelDetection(videoTaskData);
        videoTaskData.jobId = jobRes.JobId;
        
        let ddbRes = await cacheVideoTask(videoTaskData);
        log.debug('cacheVideoTask response: ', ddbRes);
    }
    
    return {};
};
