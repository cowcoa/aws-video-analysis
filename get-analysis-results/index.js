'use strict';
console.log('-- Loading zxaws-poc-02 get-analysis-results function --');

// Depend npm modules
const log = require('lambda-log');
// Depend system modules
const AWS = require('aws-sdk');
// Global objects & variables
const rekognition = new AWS.Rekognition();
const dynamodb = new AWS.DynamoDB();
// Get evn variables
const VIDEO_TASK_DDB_TABLE = process.env['VIDEO_TASK_DDB_TABLE'];

function isEmptyObject(obj) {
    return !Object.keys(obj).length;
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

function getCachedVideoTask(videoUrl) {
    return new Promise((resolve, reject) => {
        let params = {
            Key: {
                "VideoUrl": { S: videoUrl }
            }
        };
        params.TableName = VIDEO_TASK_DDB_TABLE;
        
        dynamodb.getItem(params, function(err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

function getLabelDetection(jobId) {
    return new Promise((resolve, reject) => {
        let params = {
            JobId: jobId
        };
        
        rekognition.getLabelDetection(params, function(err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

function transformLabels(labelResults, count) {
    let labelCollection = {};
    labelResults.forEach(result => {
        let label = labelCollection[result.Label.Name];
        if (label === undefined) {
            label = {
                count: 1,
                totalConfidence: result.Label.Confidence,
                averageConfidence: result.Label.Confidence
            };
        } else {
            label.count++;
            label.totalConfidence += parseFloat(result.Label.Confidence);
            label.averageConfidence = label.totalConfidence / label.count;
        }
        labelCollection[result.Label.Name] = label;
    });
    
    let labels = [];
    for (let labelName in labelCollection) {
        labels.push(
            {
                label: labelName,
                count: labelCollection[labelName].count,
                averageConfidence: labelCollection[labelName].averageConfidence,
                totalConfidence: labelCollection[labelName].totalConfidence
            }
        );
    }
    
    labels.sort(function(a, b) {
        return b.totalConfidence - a.totalConfidence;
    });
    
    if (count !== undefined) {
        labels = labels.slice(0, count);
    }
    
    return labels;
}

exports.handler = async function(event, context) {
    // Set log level first
    log.options.debug = true;
    
    log.debug('Event: ', event);
    log.debug('Context: ', context);
    log.debug('VIDEO_TASK_DDB_TABLE: ', VIDEO_TASK_DDB_TABLE);
    
    // Get video website info.
    let videoSource = event.pathParameters.website;
    log.debug('VideoSource: ', videoSource);
    
    // get videoUrl
    let videoUrl = event.queryStringParameters != null ? event.queryStringParameters.url : undefined;
    log.debug('VideoUrl: ', videoUrl);
    
    // Get JobId
    let jobId = undefined;
    let ddbRes = await getCachedVideoTask(videoUrl);
    log.debug('getCachedVideoTask response: ', JSON.stringify(ddbRes));
    
    if (!isEmptyObject(ddbRes)) {
        jobId = ddbRes.Item.JobId.S;
    }
    log.debug('JobId: ', jobId);
    
    if (jobId === undefined) {
        let response = constructHttpResponse(400, { message: 'No JobId' });
        return response;
    }
    
    // Get max labels count
    let count = event.queryStringParameters != null ? event.queryStringParameters.count : undefined;
    // count = parseInt(count, 10);
    log.debug('Max label count: ', count);
    // Debug flag
    let debug = event.queryStringParameters != null ? event.queryStringParameters.debug : undefined;
    debug = (debug === 'true');
    log.debug('Debug enabled: ', debug);
    
    try {
        let response_body = {
            status: '',
            labels: []
        };
        
        let result = await getLabelDetection(jobId);
        response_body.status = result.JobStatus;
        if (response_body.status == 'IN_PROGRESS') {
            let response = constructHttpResponse(200, response_body);
            return response;
        }
        
        if (debug == true) {
            response_body.labels = result.Labels;
            
        } else {
            response_body.labels = transformLabels(result.Labels, count);
        }
        
        let response = constructHttpResponse(200, response_body);
        return response;
                
    } catch(err) {
        log.error('Exception throwed during lambda execution:', err);
        if (err.statusCode === undefined) {
            err.statusCode = 500;
        }
        let response = constructHttpResponse(err.statusCode, { message: err.message });
        return response;
    }
};
