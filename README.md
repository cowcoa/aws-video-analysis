## Deployment Steps:

1. Create an ACM certificate containing Api Gateway custom domain name, record the ARN of the certificate.
2. Create Cloud9 environment and log in.
3. Clone project to local:
   - git clone https://github.com/cowcoa/aws-video-analysis.git aws-video-analysis
4. Execute env script to initialize local development environment:
   - ./init_local_env.sh
5. Execute proj script to initialize project dependencies:
   - ./init_project_env.sh
6. Modify deploy script(deploy_n_update.sh) and customize the parameters, including:
   - project_name, AWS resource prefix and subdomain name of the custom domain name.
   - apigateway_domain, Api Gateway custom domain name.
   - apigateway_certificate, fill in the ARN of the certificate just noted.
7. Execute deploy script to deploy project on AWS:
   - ./deploy_n_update.sh create
   > If you modified the code or resources after deployment, you can execute: "./deploy_n_update.sh update" to update the deployed project.
8. Create a CNAME record to point to the domain name of the Api Gateway deployment. You can find it here:
   - API Gateway -> Custom domain names -> Your custom domain name -> Configurations tab -> API Gateway domain name
   > It looks like this: d4leosgeum3oz.cloudfront.net
9. Get the Api Key and call the API according to the API document. You can find it here:
   - API Gateway -> APIs -> Your API -> API Keys -> Your API Key -> show API Key
   > It looks like this: kmsoo3TSOXazJJl5QIXoe78lTQ1MO2I01Dg23GXp, Fill it in the x-api-key header when you call the API.
