#!/bin/bash
# Deploy/Update project on AWS by CloudFormation.

arg_count=$#
script_name=$(basename $0)
stack_action=update

# Every resources created on AWS will be named with this prefix.
project_name="rg"
input_template_file="template.yaml"
output_template_file="packaged-template-output.yaml"
# CloudFormation stack name.
cf_stack_name="$project_name-video-analysis"
cf_change_set_name="$cf_stack_name-change-set"
# Project will be deloyed on this region.
deployment_region="$(aws ec2 describe-availability-zones --output text --query 'AvailabilityZones[0].[RegionName]')"
# S3 bucket for intermediate/temp files during deployment.
s3_bucket_deployment="$project_name-deployment-$deployment_region"
# S3 bucket for temporary video files during analysis.
s3_bucket_video_cache="$project_name-video-cache-$deployment_region"
# Custom domain of API Gateway domain name.
apigateway_domain="rgpoc02.awserverless.com"
# ACM certificate that contained custom domain name.
apigateway_certificate="arn:aws:acm:us-east-1:027226252545:certificate/07d4e2fc-bfb3-4b4e-907b-928a8fa411d6"

# Create deployment s3 bucket if no such bucket.
if aws s3 ls "s3://$s3_bucket_deployment" 2>&1 | grep -q 'NoSuchBucket'; then
        echo "Creating deployment s3 bucket $s3_bucket_deployment"
        aws s3api create-bucket --bucket $s3_bucket_deployment --region $deployment_region
        aws s3api put-public-access-block \
                --bucket $s3_bucket_deployment \
                --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
        aws s3api put-bucket-lifecycle --bucket $s3_bucket_deployment --lifecycle-configuration \
                '
                {
                    "Rules": [
                    {
                        "Expiration": {
                            "Days": 1
                        },
                        "Prefix": "",
                        "ID": "DayOne",
                        "Status": "Enabled"
                    }
                    ]
                }
                '
fi

# Create video cache s3 bucket if no such bucket.
if aws s3 ls "s3://$s3_bucket_video_cache" 2>&1 | grep -q 'NoSuchBucket'; then
        echo "Creating video cache s3 bucket $s3_bucket_video_cache"
        aws s3api create-bucket --bucket $s3_bucket_video_cache --region $deployment_region
        aws s3api put-public-access-block \
                --bucket $s3_bucket_video_cache \
                --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
        aws s3api put-bucket-lifecycle --bucket $s3_bucket_video_cache --lifecycle-configuration \
                '
                {
                    "Rules": [
                    {
                        "Expiration": {
                            "Days": 1
                        },
                        "Prefix": "",
                        "ID": "DayOne",
                        "Status": "Enabled"
                    }
                    ]
                }
                '
fi

if test $arg_count -eq 1
then
    if [[ $1 =~ ^(create|update)$ ]]; then
        stack_action=$1
    else
        echo "Stack Action must be create or update"
        echo "Usage: $script_name [create|update]"
        exit -1
    fi
else
    echo "Usage: $script_name [create|update]"
    echo ""
    echo "Examples:"
    echo "$script_name create"
    echo ""
    exit 0
fi

echo "${stack_action^^} $cf_stack_name cloudformation stack..."
if [ $stack_action = update ]; then
    echo "NOTE: Before UPDATE a stack, be sure you already have the corresponding stack in cloudformation"
fi;

if [ -f $output_template_file ]
then
	rm -rf $output_template_file
fi

echo "Packaging..."
aws cloudformation package \
    --template-file $input_template_file \
    --s3-bucket $s3_bucket_deployment \
    --output-template-file $output_template_file

result=$?

if test $result -ne 0
then
    echo "Failed to package template $input_template_file"
	exit $result
fi

echo "Uploading template file..."
aws s3api put-object \
    --bucket $s3_bucket_deployment \
    --key $output_template_file \
    --body $output_template_file

echo "Creating change set..."
aws cloudformation create-change-set \
    --change-set-type ${stack_action^^} \
    --stack-name $cf_stack_name \
    --change-set-name $cf_change_set_name \
    --template-url https://$s3_bucket_deployment.s3.$deployment_region.amazonaws.com/$output_template_file \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --parameters ParameterKey="ApiGatewayCNAME",ParameterValue=$apigateway_domain \
                 ParameterKey="ApiGatewayCertificate",ParameterValue=$apigateway_certificate \
                 ParameterKey="S3BucketVideoCache",ParameterValue=$s3_bucket_video_cache \
                 ParameterKey="ResourceNamePrefix",ParameterValue=$project_name
                 
result=$?

if test $result -ne 0
then
    echo "Failed to create change set $cf_change_set_name"
	exit $result
fi

echo "Waiting for change-set-create-complete..."
aws cloudformation wait \
    change-set-create-complete \
    --stack-name $cf_stack_name \
    --change-set-name $cf_change_set_name
    
result=$?

if test $result -ne 0
then
    echo "create-change-set return failed"
	exit $result
fi

echo "Executing change set..."
aws cloudformation execute-change-set \
    --change-set-name $cf_change_set_name \
    --stack-name $cf_stack_name

echo "Waiting for stack executing complete..."
aws cloudformation wait \
    stack-${stack_action}-complete \
    --stack-name $cf_stack_name

result=$?

if test $result -ne 0
then
    echo "Deleting change set..."
    aws cloudformation delete-change-set \
        --stack-name $cf_stack_name \
        --change-set-name $cf_change_set_name
fi

if [ -f $output_template_file ]
then
	rm -rf $output_template_file
fi

echo "Done"
