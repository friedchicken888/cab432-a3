const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, CreateBucketCommand, PutBucketTaggingCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const { getAwsRegion, getParameter } = require("./awsConfigService");

let s3ClientInstance = null;
let BUCKET_NAME;
let QUT_USERNAME;
let PURPOSE;

let s3ConfigInitialised = null;

async function initialiseS3Config() {
  BUCKET_NAME = await getParameter('/n11051337/s3_bucket_name');
  QUT_USERNAME = await getParameter('/n11051337/s3_tag_qut_username');
  PURPOSE = await getParameter('/n11051337/s3_tag_purpose');

  if (!BUCKET_NAME) {
    console.error('S3_BUCKET_NAME is not defined in Parameter Store. Exiting application.');
    process.exit(1);
  }
}

s3ConfigInitialised = initialiseS3Config();

async function getS3Client() {
  if (s3ClientInstance) {
    return s3ClientInstance;
  }
  const region = await getAwsRegion();
  s3ClientInstance = new S3Client({
    region: region,
  });
  return s3ClientInstance;
}


const s3Service = {
  async ensureBucketAndTags() {
    await s3ConfigInitialised;
    if (!BUCKET_NAME) {
      console.error('S3_BUCKET_NAME is not defined in Parameter Store. Exiting application.');
      throw new Error('S3_BUCKET_NAME is not defined.');
    }

    let s3Client;
    try {
      s3Client = await getS3Client();
      await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    } catch (error) {
      if (error.name === 'NotFound' || error.name === 'NoSuchBucket') {
        try {
          await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
        } catch (createError) {
          console.error(`Error creating S3 Bucket '${BUCKET_NAME}':`, createError);
          throw new Error(`Failed to create S3 Bucket '${BUCKET_NAME}'.`);
        }
      } else {
        console.error(`Error checking S3 Bucket '${BUCKET_NAME}':`, error);
        throw new Error(`Failed to check S3 Bucket '${BUCKET_NAME}'.`);
      }
    }

    if (QUT_USERNAME && PURPOSE) {
      try {
        await s3Client.send(new PutBucketTaggingCommand({
          Bucket: BUCKET_NAME,
          Tagging: {
            TagSet: [
              { Key: 'qut-username', Value: QUT_USERNAME },
              { Key: 'purpose', Value: PURPOSE },
            ],
          },
        }));
      } catch (tagError) {
        console.error(`Error tagging S3 Bucket '${BUCKET_NAME}':`, tagError);
      }
    } else {

    }
  },

  async uploadFile(fileBuffer, contentType, folder = 'fractals', fileName = null) {
    await s3ConfigInitialised;
    const key = fileName ? `${folder}/${fileName}.png` : `${folder}/${uuidv4()}.png`;
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      ACL: 'private',
    };

    try {
      const s3Client = await getS3Client();
      const command = new PutObjectCommand(params);
      await s3Client.send(command);
      return key;
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw new Error('Failed to upload file to S3.');
    }
  },

  async getPresignedUrl(key, expiresSeconds = 300) {
    await s3ConfigInitialised;
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    try {
      const s3Client = await getS3Client();
      const url = await getSignedUrl(s3Client, command, { expiresIn: expiresSeconds });
      return url;
    } catch (error) {
      console.error('Error generating pre-signed URL:', error);
      throw new Error('Failed to generate pre-signed URL.');
    }
  },

  async deleteFile(key) {
    await s3ConfigInitialised;
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
    };

    try {
      const s3Client = await getS3Client();
      const command = new DeleteObjectCommand(params);
      await s3Client.send(command);
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      throw new Error('Failed to delete file from S3.');
    }
  },
};

module.exports = s3Service;