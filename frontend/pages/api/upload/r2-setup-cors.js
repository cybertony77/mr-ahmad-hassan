import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

// Load environment variables from env.config
function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=');
        if (index !== -1) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          value = value.replace(/^"|"$/g, '');
          envVars[key] = value;
        }
      }
    });
    
    return envVars;
  } catch (error) {
    console.log('Could not read env.config, using process.env as fallback');
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const envConfig = loadEnvConfig();

    const accountId = envConfig.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
    const accessKeyId = envConfig.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = envConfig.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = envConfig.R2_BUCKET_NAME || process.env.R2_BUCKET_NAME;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      return res.status(500).json({ error: 'R2 configuration is missing' });
    }

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });

    const command = new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
            AllowedOrigins: ['*'],
            ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
            MaxAgeSeconds: 86400,
          },
        ],
      },
    });

    await s3Client.send(command);

    res.json({ success: true, message: 'CORS configured successfully on R2 bucket' });
  } catch (error) {
    console.error('R2 CORS setup error:', error);
    res.status(500).json({ error: 'Failed to configure CORS', details: error.message });
  }
}
