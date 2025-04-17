const { Storage } = require('@google-cloud/storage');

// Create storage instance
let storage;
if (process.env.NODE_ENV === 'production') {
  // In production (Render), use credentials from environment variable
  console.log('Initializing GCS in production mode');
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS || '{}');
    console.log('Parsed credentials:', {
      projectId: credentials.project_id,
      clientEmail: credentials.client_email,
      hasPrivateKey: !!credentials.private_key
    });
    storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      credentials
    });
  } catch (error) {
    console.error('Error parsing GCS credentials:', error);
    throw error;
  }
} else {
  // In development, use key file
  console.log('Initializing GCS in development mode');
  console.log('Using key file:', process.env.GOOGLE_CLOUD_KEY_FILE);
  storage = new Storage({
    keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
  });
}

const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME);
console.log('Using GCS bucket:', process.env.GOOGLE_CLOUD_BUCKET_NAME);

// Upload file to Google Cloud Storage
const uploadFile = async (file) => {
  try {
    console.log('Starting file upload to GCS:', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });

    const blob = bucket.file(file.originalname);
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
