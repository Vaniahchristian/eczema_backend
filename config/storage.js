const { Storage } = require('@google-cloud/storage');

// Create storage instance
let storage;
try {
  // First try to use credentials from environment variable
  if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
    console.log('Initializing GCS with credentials from environment');
    const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
    
    // Fix private key format for Node.js 20
    if (credentials.private_key) {
      // Replace "\n" with actual newlines and ensure proper PEM format
      credentials.private_key = credentials.private_key
        .replace(/\\n/g, '\n')
        .replace(/-----BEGIN PRIVATE KEY-----\n/, '-----BEGIN PRIVATE KEY-----\n')
        .replace(/\n-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----\n');
    }

    console.log('Parsed credentials:', {
      projectId: credentials.project_id,
      clientEmail: credentials.client_email,
      hasPrivateKey: !!credentials.private_key,
      privateKeyLength: credentials.private_key ? credentials.private_key.length : 0
    });

    storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      credentials
    });
  } 
  // Fallback to key file if environment credentials not found
  else if (process.env.GOOGLE_CLOUD_KEY_FILE) {
    console.log('Initializing GCS with key file');
    console.log('Using key file:', process.env.GOOGLE_CLOUD_KEY_FILE);
    storage = new Storage({
      keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
    });
  } else {
    throw new Error('No Google Cloud credentials found in environment or key file');
  }
} catch (error) {
  console.error('Error initializing GCS:', error);
  throw error;
}

const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME);
console.log('Using GCS bucket:', process.env.GOOGLE_CLOUD_BUCKET_NAME);

// Upload file to Google Cloud Storage
const uploadFile = async (file) => {
  try {
    // Generate a unique filename to prevent overwrites
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = file.originalname.split('.').pop();
    const filename = `${uniqueSuffix}.${extension}`;

    console.log('Starting file upload to GCS:', {
      originalname: file.originalname,
      filename,
      mimetype: file.mimetype,
      size: file.size
    });

    const blob = bucket.file(filename);
    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: file.mimetype
      }
    });

    return new Promise((resolve, reject) => {
      blobStream.on('error', (error) => {
        console.error('Blob stream error:', error);
        reject(error);
      });

      blobStream.on('finish', async () => {
        try {
          console.log('Stream finished, making blob public...');
          // Make the file public
          await blob.makePublic();
          
          // Get the public URL
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
          console.log('File uploaded successfully to:', publicUrl);
          resolve(publicUrl);
        } catch (error) {
          console.error('Error making blob public:', error);
          reject(error);
        }
      });

      console.log('Writing buffer to blob stream...');
      blobStream.end(file.buffer);
    });
  } catch (error) {
    console.error('Upload error:', error);
    throw new Error(`Could not upload file: ${error.message}`);
  }
};

module.exports = {
  uploadFile,
  bucket
};
