# Audio Transcription Tool

A Node.js utility for transcribing audio files using OpenAI's Whisper API with support for both local files and files stored in Cloudflare R2.

## Features

- Transcribe audio files from local storage
- Transcribe audio files stored in Cloudflare R2 buckets
- Output transcription results as JSON files
- Simple command-line interface
- Error handling and detailed logging

## Prerequisites

- Node.js (v18 or later recommended)
- An OpenAI API key with access to the Whisper API
- Cloudflare R2 storage credentials (if using R2 storage)

## Installation

1. Clone this repository or download the source code
2. Install the dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory with your API keys:

```
OPENAI_API_KEY=your_openai_api_key_here
R2_ACCOUNT_ID=your_r2_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_r2_bucket_name
```

## Usage

### Command Line Interface

#### Transcribe a local file:

```bash
node transcribe.js path/to/local/audio/file.mp3 --local
```

Note: The `--local` flag is optional if the file exists locally.

#### Transcribe a file from R2 storage:

```bash
node transcribe.js r2/path/to/file.mp3
```

### Programmatic Usage

The module exports two main functions:

#### Transcribe a local file:

```javascript
import { transcribeLocalFile } from './transcribe.js';

const result = await transcribeLocalFile('path/to/local/audio/file.mp3');
console.log(result.transcription.text);
```

#### Transcribe a file from R2:

```javascript
import { transcribeR2File } from './transcribe.js';

const result = await transcribeR2File('r2/path/to/file.mp3');
console.log(result.transcription.text);
```

## Response Format

The transcription result object contains:

```javascript
{
  transcription: {
    text: "The full transcription text goes here...",
    // Other fields returned by Whisper API
  },
  localOutputPath: "output_filename.json",
  // For R2 files
  r2FileName: "r2/path/to/file.mp3"  // Only present when using transcribeR2File
  // For local files
  localFilePath: "path/to/local/audio/file.mp3"  // Only present when using transcribeLocalFile
}
```

## How It Works

1. **Local Files**: The system directly processes the file from the specified path.
2. **R2 Files**: 
   - Downloads the file from R2 to a temporary location
   - Processes the file
   - Cleans up the temporary file after processing

3. **Processing**:
   - Calculates file size
   - Sends the file to OpenAI's Whisper API
   - Measures transcription time
   - Saves the result as a JSON file

## Dependencies

- `@aws-sdk/client-s3` - For interacting with Cloudflare R2 (S3-compatible storage)
- `@aws-sdk/s3-request-presigner` - For generating pre-signed URLs
- `form-data` - For properly handling multipart/form-data in API requests
- `node-fetch` - For making HTTP requests
- `dotenv` - For loading environment variables

## Limitations

- Supports audio files that are compatible with Whisper API (MP3, MP4, MPEG, MPGA, M4A, WAV, and WEBM)
- File size limitations are imposed by the Whisper API (currently 25MB)

## Error Handling

The tool provides detailed error messages and logging:
- API response errors
- File access issues
- Network problems
- Authentication failures

## License

[MIT License](LICENSE)