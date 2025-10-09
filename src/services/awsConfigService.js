const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

let cachedAwsRegion = null;
let jwtSecret = null;
let cognitoClientSecret = null;

async function getAwsRegion() {
    if (cachedAwsRegion) {
        return cachedAwsRegion;
    }
    try {
        const client = new SSMClient({ region: "ap-southeast-2" });
        const command = new GetParameterCommand({
            Name: '/n11051337/aws_region',
            WithDecryption: true,
        });
        const response = await client.send(command);
        if (response.Parameter && response.Parameter.Value) {
            cachedAwsRegion = response.Parameter.Value;
            return cachedAwsRegion;
        } else {
            console.error('Failed to retrieve AWS_REGION from Parameter Store. Exiting application.');
            process.exit(1);
        }
    } catch (error) {
        console.error('Error fetching AWS_REGION from Parameter Store:', error);
        process.exit(1);
    }
}

module.exports = {
    getAwsRegion,
    getJwtSecret: async () => {
        if (jwtSecret) {
            return jwtSecret;
        }

        const region = await getAwsRegion();
        const secretsManagerClient = new SecretsManagerClient({ region: region });

        try {
            const secret_name = "n11051337-A2-JWT";
            const response = await secretsManagerClient.send(
                new GetSecretValueCommand({
                    SecretId: secret_name
                })
            );

            if (response.SecretString) {
                const secrets = JSON.parse(response.SecretString);
                jwtSecret = secrets.JWT_SECRET;
                return jwtSecret;
            } else {
    
            }
        } catch (error) {
            console.error("Error retrieving JWT secret from AWS Secrets Manager:", error);
            process.exit(1);
        }
        return null;
    },
    getCognitoClientSecret: async () => {
        if (cognitoClientSecret) {
            return cognitoClientSecret;
        }

        const region = await getAwsRegion();
        const secretsManagerClient = new SecretsManagerClient({ region: region });

        try {
            const secret_name = "n11051337-A2-Cognito";
            const response = await secretsManagerClient.send(
                new GetSecretValueCommand({
                    SecretId: secret_name
                })
            );

            if (response.SecretString) {
                const secrets = JSON.parse(response.SecretString);
                cognitoClientSecret = secrets.AWS_COGNITO_CLIENT_SECRET;
                return cognitoClientSecret;
            } else {
    
            }
        } catch (error) {
            console.error("Error retrieving Cognito Client Secret from AWS Secrets Manager:", error);
            process.exit(1);
        }
        return null;
    },
    getParameter: async (parameterName) => {
        const region = await getAwsRegion();
        const ssmClient = new SSMClient({ region: region });

        try {
            const command = new GetParameterCommand({
                Name: parameterName,
                WithDecryption: true,
            });
            const response = await ssmClient.send(command);
            if (response.Parameter && response.Parameter.Value) {
                return response.Parameter.Value;
            }
        } catch (error) {
            console.error(`Error retrieving parameter ${parameterName} from AWS Parameter Store:`, error);
            process.exit(1);
        }
        return null;
    },
};