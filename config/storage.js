const { Storage } = require('@google-cloud/storage');

// Create storage instance
let storage;
if (process.env.NODE_ENV === 'production') {
  // In production (Render), use credentials from environment variable
  storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    credentials: JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS || '{}')
  });
} else {
  // In development, use key file
  storage = new Storage({
    keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
  });
}

const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME);

// Upload file to Google Cloud Storage
const uploadFile = async (file) => {
  try {
    const blob = bucket.file(file.originalname);
    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: file.mimetype
      }
    });

    return new Promise((resolve, reject) => {
      blobStream.on('error', (error) => {
        reject(error);
      });

      blobStream.on('finish', async () => {
        // Make the file public
        await blob.makePublic();
        
        // Get the public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        resolve(publicUrl);
      });

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
