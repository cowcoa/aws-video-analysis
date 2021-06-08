'use strict';
console.log('-- Loading zxaws-poc analyze-video function --');

// Depend npm modules
const youtubedl = require('youtube-dl');
const log = require('lambda-log');
// Depend system modules
const stream = require('stream');
const AWS = require('aws-sdk');
// Global objects & variables
const rekognition = new AWS.Rekognition();
// Get evn variables
const VIDEO_CACHE_BUCKET = process.env['S3_VIDEO_CACHE_BUCKET'];
const PYTHON_LIB_PATH = process.env['LAMBDA_TASK_ROOT'] + "/python3/lib";
const PYTHON_BIN_PATH = process.env['LAMBDA_TASK_ROOT'] + "/python3/bin";

function constructHttpResponse(code, body) {
    let response;
    if (body === undefined || body === null) {
        response = {
            statusCode: code
        };
    } else {
        response = {
            statusCode: code,
            body: JSON.stringify(body)
        };
    }
    return response;
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
                log.error('Failed to upload object to s3: ', err);
                reject(err);
            } else {
                log.debug('Upload done');
                resolve();
            }
        });
    });
}

function startLabelDetection(objectKey) {
    log.debug("StartLabelDetection from " + objectKey + " in s3 bucket " + VIDEO_CACHE_BUCKET);
    return new Promise((resolve, reject) => {
        let params = {
            Video: {
                S3Object: {
                    Bucket: VIDEO_CACHE_BUCKET,
                    Name: objectKey
                }
            }
        };
        
        rekognition.startLabelDetection(params, function(err, data) {
            if (err) {
                log.error('Failed to startLabelDetection: ', err);
                reject(err);
            } else {
                log.debug('startLabelDetection response: ', data);
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
    
    // Get video website info.
    let videoSource = event.pathParameters.website;
    log.debug('Video Source: ', videoSource);
    
    // Update python env
    process.env['PATH'] = process.env['PATH'] + ':' + PYTHON_BIN_PATH;
    process.env['PYTHONPATH'] = PYTHON_LIB_PATH;
    
    let urlArray = [];
    let urlArrayData;
    try {
        urlArrayData = JSON.parse(event.body);
        log.debug('albumArrayData:', urlArrayData);
        if (!Array.isArray(urlArrayData.urls)) {
            let response = constructHttpResponse(400, { message:'Invalid Body: Missing required fields' });
            return response;
        }
        
        urlArrayData.urls.forEach(element => {
            let urlLink = element.replace(/\+/g, '%20');
            urlLink = decodeURIComponent(urlLink);
            let urlId = urlLink.slice(-11) + '.mp4';
            let url = {
                'id': urlId,
                'url': urlLink
            }
            urlArray.push(url);
        });
        
    } catch (err) {
        log.error('%s: %s', err.name, err.message);
        let response = constructHttpResponse(400, { message: 'Invalid Body: Bad JSON' });
        return response;
    }
    
    // Limit max job count to 1.
    if (urlArray.length != 1) {
        let response = constructHttpResponse(400, { message: 'For now, we only process one video url per post.' });
        return response;
    }
    
    log.debug('re-print url array: ', urlArray);
    
    try {
        const passtrough = new stream.PassThrough();
        
        const dl = youtubedl(urlArray[0].url, ['--format=best[ext=mp4]'], {maxBuffer: Infinity});
        dl.pipe(passtrough); // write video to the pass-through stream
        
        log.info('*** uploadVideoObject....');
        await uploadVideoObject(urlArray[0].id, passtrough);
        
        log.info('try label video....');
        let res = await startLabelDetection(urlArray[0].id);
        log.info('label resp: ', res);
        //await getLabelDetection(res.JobId);
        /*
        log.info('getLabelDetection begin');
        await sleep(20000);
        await getLabelDetection(res.JobId);
        log.info('getLabelDetection return');
        */
        
        /*
        let responseBody = {
            resourceVersion: versionData == null ? "" : versionData
        };
        */
        let response = constructHttpResponse(200, [
                {
                    jobName: urlArray[0].id,
                    jobId: res.JobId
                }
            ]);
        return response;
                
    } catch(err) {
        log.error('Lambda execution failed: ', err).toJSON(true);
        if (err.statusCode === undefined) {
            err.statusCode = 500;
        }
        let response = constructHttpResponse(err.statusCode, { message: err.message });
        return response;
    }
};
