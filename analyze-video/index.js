'use strict';
console.log('-- Loading zxaws-poc-02 analyze-video function --');

// Depend npm modules
const log = require('lambda-log');
// Depend system modules
const AWS = require('aws-sdk');
// Global objects & variables
const sqs = new AWS.SQS();
// Get evn variables
const VIDEO_TASK_QUEUE_URL = process.env['VIDEO_TASK_QUEUE_URL'];

function sendSqsMessage(queueUrl, message) {
    log.debug('Send sqs message ', message, ' to ', queueUrl);
    return new Promise((resolve, reject) => {
        let params = {
          MessageBody: JSON.stringify(message),
          QueueUrl: queueUrl
        };
        sqs.sendMessage(params, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

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

exports.handler = async function(event, context) {
    // Set log level first
    log.options.debug = true;
    
    log.debug('Event:', event);
    log.debug('Context:', context);
    log.debug('VIDEO_TASK_QUEUE_URL: ', VIDEO_TASK_QUEUE_URL);
    
    // Get video website info.
    let videoSource = event.pathParameters.website;
    log.debug('Video Source: ', videoSource);
    
    let urlArrayData;
    try {
        urlArrayData = JSON.parse(event.body);
        log.debug('urlArrayData:', urlArrayData);
        if (!Array.isArray(urlArrayData.urls)) {
            let response = constructHttpResponse(400, { message:'Invalid Body: Missing required fields' });
            return response;
        }
        
    } catch (err) {
        log.error('', err.name, ':', err.message);
        let response = constructHttpResponse(400, { message: 'Invalid Body: Bad JSON' });
        return response;
    }
    
    try {
        for (let i = 0; i < urlArrayData.urls.length; i++) {
            let element = urlArrayData.urls[i];
            
            let urlLink = element.replace(/\+/g, '%20');
            urlLink = decodeURIComponent(urlLink);
            
            let videoAnalysisTask = {
                // Only for YouTube URL.
                // url: https://www.youtube.com/watch?v=9TvFFD94Cu8
                // id: 9TvFFD94Cu8
                id: urlLink.slice(-11),
                url: urlLink
            };
            
            // Send task message to video anaysis task queue
            let sqsResponse = await sendSqsMessage(VIDEO_TASK_QUEUE_URL, videoAnalysisTask);
            log.debug('SQS Queue response: ', sqsResponse);
        }
                
    } catch(err) {
        log.error('Lambda execution failed: ', err);
        if (err.statusCode === undefined) {
            err.statusCode = 500;
        }
        let response = constructHttpResponse(err.statusCode, { message: err.message });
        return response;
    }
    
    let response = constructHttpResponse(200);
    return response;
};
