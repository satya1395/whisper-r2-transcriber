import 'dotenv/config';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import FormData from 'form-data';
import fs from 'fs';
import os from 'os';
import path from 'path';
// Use node-fetch for reliable FormData handling
import fetch from 'node-fetch';

// Load R2 credentials from environment variables
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

// Create S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Download a file from R2
 * @param {string} r2FileName - The file path in R2 bucket
 * @returns {Promise<string>} - Path to the downloaded temporary file
 */
async function downloadFileFromR2(r2FileName) {
  console.log(`📥 Downloading file from R2: ${r2FileName}`);
  
  try {
    // Create a GetObject command
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2FileName,
    });
    
    // Get a signed URL for the file
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
    
    // Create a temporary file path
    const tempDir = os.tmpdir();
    const originalFileName = path.basename(r2FileName);
    const tempFilePath = path.join(tempDir, originalFileName);
    
    // Download the file
    const response = await fetch(signedUrl);
    if (!response.ok) {
      throw new Error(`Download failed with status: ${response.status}`);
    }
    
    // With Node 18, response.body is a Web ReadableStream, not a Node.js stream
    // We need to convert it properly or use a different approach
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempFilePath, Buffer.from(buffer));
    
    console.log(`✅ File downloaded to temporary location: ${tempFilePath}`);
    return tempFilePath;
  } catch (error) {
    console.error('❌ Download error:', error);
    throw error;
  }
}

/**
 * Call OpenAI Whisper API to transcribe an audio file
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<object>} - Transcription result
 */
async function callWhisperAPI(filePath) {
  console.log(`🎤 Transcribing file: ${filePath}`);
  
  try {
    console.log('📞 Calling OpenAI Whisper API...');
    
    // Use node-fetch's FormData which handles multipart/form-data correctly
    const formData = new FormData();
    formData.append('model', 'whisper-1');
    formData.append('file', fs.createReadStream(filePath), {
      filename: path.basename(filePath)
    });
    
    // Make the request with headers from form-data
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('❌ Error calling Whisper API:', error);
    throw error;
  }
}

/**
 * Core function to handle the transcription process
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<object>} - Object containing transcription and file paths
 */
async function processTranscription(filePath) {
  try {
    // Get file information
    const fileStats = fs.statSync(filePath);
    const fileSizeMB = fileStats.size / (1024 * 1024);
    console.log(`📊 File size: ${fileSizeMB.toFixed(2)} MB`);
    
    // Call Whisper API
    const startTime = Date.now();
    const transcription = await callWhisperAPI(filePath);
    const duration = (Date.now() - startTime) / 1000;
    
    console.log(`⏱️ Transcription completed in ${duration.toFixed(2)} seconds`);
    
    // Generate output filename
    const fileName = path.basename(filePath);
    const outputFileName = fileName.replace(/\.[^/.]+$/, '.json');
    
    // Save result locally
    fs.writeFileSync(outputFileName, JSON.stringify(transcription, null, 2));
    console.log(`✅ Transcription saved to: ${outputFileName}`);
    
    // Print the transcription text to console
 /*    console.log('\n📝 Transcription:');
    console.log('=============');
    console.log(transcription.text); */
    
    return {
      transcription,
      localOutputPath: outputFileName
    };
  } catch (error) {
    console.error('❌ Processing failed:', error);
    throw error;
  }
}

/**
 * Transcribe a local audio file
 * @param {string} localFilePath - Path to the local audio file
 * @returns {Promise<object>} - Transcription result with file paths
 */
export async function transcribeLocalFile(localFilePath) {
  console.log(`🔄 Processing local file: ${localFilePath}`);
  
  // Verify file exists
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`File not found: ${localFilePath}`);
  }
  
  const result = await processTranscription(localFilePath);
  return {
    ...result,
    localFilePath
  };
}

/**
 * Transcribe an audio file stored in R2
 * @param {string} r2FileName - The file path in R2 bucket
 * @returns {Promise<object>} - Transcription result with file paths
 */
export async function transcribeR2File(r2FileName) {
  try {
    console.log(`🔄 Processing R2 file: ${r2FileName}`);
    
    // Download the file from R2
    const localFilePath = await downloadFileFromR2(r2FileName);
    
    const result = await processTranscription(localFilePath);
    
    // Clean up the temporary file
    fs.unlinkSync(localFilePath);
    console.log(`🧹 Cleaned up temporary file: ${localFilePath}`);
    
    return {
      ...result,
      r2FileName
    };
  } catch (error) {
    console.error('❌ Processing failed:', error);
    throw error;
  }
}

// Check if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const fileArg = process.argv[2];
  const isLocalFlag = process.argv.includes('--local');
  
  if (!fileArg) {
    console.error('❌ Please provide a file path:');
    console.error('   node transcribe.js path/to/file.mp3 --local');
    console.error('   node transcribe.js r2/path/to/file.mp3');
    process.exit(1);
  }
  
  // Check if it's a local file (either explicitly flagged or file exists)
  const isLocalFile = isLocalFlag || fs.existsSync(fileArg);
  
  if (isLocalFile) {
    transcribeLocalFile(fileArg)
      .then(result => {
        console.log(`✨ Success! Transcription completed for: ${result.localFilePath}`);
        console.log(`📄 Transcription saved locally at: ${result.localOutputPath}`);
      })
      .catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
      });
  } else {
    transcribeR2File(fileArg)
      .then(result => {
        console.log(`✨ Success! Transcription completed for: ${result.r2FileName}`);
        console.log(`📄 Transcription saved locally at: ${result.localOutputPath}`);
      })
      .catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
      });
  }
}