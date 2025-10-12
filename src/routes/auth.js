const express = require('express');
const { CognitoIdentityProviderClient, SignUpCommand, ConfirmSignUpCommand, InitiateAuthCommand, RespondToAuthChallengeCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { CognitoJwtVerifier } = require("aws-jwt-verify");
const crypto = require('crypto');
const awsConfigService = require('../services/awsConfigService');

const router = express.Router();

let USER_POOL_ID;
let CLIENT_ID;

async function initialiseCognitoConfig() {
    USER_POOL_ID = await awsConfigService.getParameter('/n11051337/user_pool_id');
    CLIENT_ID = await awsConfigService.getParameter('/n11051337/client_id');
    if (!USER_POOL_ID || !CLIENT_ID) {
        console.error('Failed to retrieve Cognito User Pool ID or Client ID from Parameter Store. Exiting application.');
        process.exit(1);
    }
}

initialiseCognitoConfig();

async function secretHash(clientId, username) {
    const POOL_REGION = await awsConfigService.getParameter('/n11051337/aws_region');
    if (!POOL_REGION) {
        console.error('Failed to retrieve POOL_REGION from Parameter Store. Exiting application.');
        process.exit(1);
    }
    const cognitoClient = new CognitoIdentityProviderClient({ region: POOL_REGION });

    const clientSecret = await awsConfigService.getCognitoClientSecret();
    const hasher = crypto.createHmac('sha256', clientSecret);
    hasher.update(`${username}${clientId}`);
    return hasher.digest('base64');
}

let idVerifier;

async function initialiseIdVerifier() {
    await initialiseCognitoConfig();
    idVerifier = CognitoJwtVerifier.create({
        userPoolId: USER_POOL_ID,
        tokenUse: "id",
        clientId: CLIENT_ID,
    });
}

initialiseIdVerifier();

async function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).send('Access denied. No token provided.');
    }

    try {
        const payload = await idVerifier.verify(token);
        req.user = {
            id: payload.sub,
            username: payload['cognito:username'],
            email: payload.email,
            role: (payload['cognito:groups'] && payload['cognito:groups'].includes('admin')) ? 'admin' : 'user'
        };
        next();
    } catch (err) {
        res.status(403).send('Invalid token.');
    }
}

router.post('/signup', async (req, res) => {
    const POOL_REGION = await awsConfigService.getParameter('/n11051337/aws_region');
    if (!POOL_REGION) {
        console.error('Failed to retrieve POOL_REGION from Parameter Store. Exiting application.');
        process.exit(1);
    }
    const cognitoClient = new CognitoIdentityProviderClient({ region: POOL_REGION });

    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).send('Username, email, and password are required.');
    }

    const params = {
        ClientId: CLIENT_ID,
        SecretHash: await secretHash(CLIENT_ID, username),
        Username: username,
        Password: password,
        UserAttributes: [
            { Name: 'email', Value: email },
        ],
    };

    try {
        const command = new SignUpCommand(params);
        await cognitoClient.send(command);
        res.status(200).send('User registered successfully. Please check your email for a confirmation code.');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

router.post('/confirm', async (req, res) => {
    const POOL_REGION = await awsConfigService.getParameter('/n11051337/aws_region');
    if (!POOL_REGION) {
        console.error('Failed to retrieve POOL_REGION from Parameter Store. Exiting application.');
        process.exit(1);
    }
    const cognitoClient = new CognitoIdentityProviderClient({ region: POOL_REGION });

    const { username, confirmationCode } = req.body;

    if (!username || !confirmationCode) {
        return res.status(400).send('Username and confirmation code are required.');
    }

    const params = {
        ClientId: CLIENT_ID,
        SecretHash: await secretHash(CLIENT_ID, username),
        Username: username,
        ConfirmationCode: confirmationCode,
    };

    try {
        const command = new ConfirmSignUpCommand(params);
        await cognitoClient.send(command);
        res.status(200).send('User confirmed successfully.');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

router.post('/login', async (req, res) => {
    const POOL_REGION = await awsConfigService.getParameter('/n11051337/aws_region');
    if (!POOL_REGION) {
        console.error('Failed to retrieve POOL_REGION from Parameter Store. Exiting application.');
        process.exit(1);
    }
    const cognitoClient = new CognitoIdentityProviderClient({ region: POOL_REGION });

    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send('Username and password are required.');
    }

    const params = {
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: {
            USERNAME: username,
            PASSWORD: password,
            SECRET_HASH: await secretHash(CLIENT_ID, username),
        },
    };

    try {
        const command = new InitiateAuthCommand(params);
        const response = await cognitoClient.send(command);

        if (response.ChallengeName === 'EMAIL_OTP') {
            return res.status(202).json({
                challengeName: response.ChallengeName,
                session: response.Session,
                challengeParameters: response.ChallengeParameters,
            });
        }

        res.json({
            idToken: response.AuthenticationResult.IdToken,
            accessToken: response.AuthenticationResult.AccessToken,
            expiresIn: response.AuthenticationResult.ExpiresIn,
            tokenType: response.AuthenticationResult.TokenType,
        });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

router.post('/confirm-mfa', async (req, res) => {
    const POOL_REGION = await awsConfigService.getParameter('/n11051337/aws_region');
    if (!POOL_REGION) {
        console.error('Failed to retrieve POOL_REGION from Parameter Store. Exiting application.');
        process.exit(1);
    }
    const cognitoClient = new CognitoIdentityProviderClient({ region: POOL_REGION });

    const { username, mfaCode, session } = req.body;

    if (!username || !mfaCode || !session) {
        return res.status(400).send('Username, MFA code, and session are required.');
    }

    const params = {
        ChallengeName: 'EMAIL_OTP',
        ClientId: CLIENT_ID,
        ChallengeResponses: {
            USERNAME: username,
            EMAIL_OTP_CODE: mfaCode,
            SECRET_HASH: await secretHash(CLIENT_ID, username),
        },
        Session: session,
    };

    try {
        const command = new RespondToAuthChallengeCommand(params);
        const response = await cognitoClient.send(command);
        res.json({
            idToken: response.AuthenticationResult.IdToken,
            accessToken: response.AuthenticationResult.AccessToken,
            expiresIn: response.AuthenticationResult.ExpiresIn,
            tokenType: response.AuthenticationResult.TokenType,
        });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

exports.router = router;
exports.verifyToken = verifyToken;