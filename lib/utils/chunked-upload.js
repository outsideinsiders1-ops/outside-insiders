/**
 * Chunked Upload Utility
 * Handles large file uploads by splitting into chunks and uploading sequentially
 */

/**
 * Uploads a file in chunks to Supabase Storage
 * @param {Object} supabase - Supabase client instance
 * @param {File} file - File to upload
 * @param {string} bucketName - Supabase storage bucket name
 * @param {string} filePath - Destination path in storage
 * @param {Object} options - Upload options
 * @param {number} options.chunkSize - Size of each chunk in bytes (default: 20MB)
 * @param {Function} options.onProgress - Progress callback (chunkNumber, totalChunks, bytesUploaded, totalBytes)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function uploadFileInChunks(supabase, file, bucketName, filePath, options = {}) {
  const { chunkSize = 20 * 1024 * 1024, onProgress } = options // 20MB default
  const totalChunks = Math.ceil(file.size / chunkSize)
  
  if (!supabase) {
    throw new Error('Supabase client is required')
  }

  try {
    // Upload chunks sequentially
    for (let chunkNumber = 0; chunkNumber < totalChunks; chunkNumber++) {
      const start = chunkNumber * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)
      
      const chunkPath = `${filePath}.chunk.${chunkNumber}`
      
      // Upload chunk
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(chunkPath, chunk, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        throw new Error(`Failed to upload chunk ${chunkNumber + 1}/${totalChunks}: ${uploadError.message}`)
      }

      // Report progress
      if (onProgress) {
        const bytesUploaded = end
        onProgress({
          chunkNumber: chunkNumber + 1,
          totalChunks,
          bytesUploaded,
          totalBytes: file.size,
          percentage: Math.round((bytesUploaded / file.size) * 100)
        })
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Chunked upload error:', error)
    return {
      success: false,
      error: error.message || 'Upload failed'
    }
  }
}

/**
 * Downloads and reassembles chunks from Supabase Storage
 * @param {Object} supabase - Supabase client instance
 * @param {string} bucketName - Supabase storage bucket name
 * @param {string} filePath - Base file path (without .chunk.X suffix)
 * @param {number} totalChunks - Total number of chunks
 * @returns {Promise<Blob>} Reassembled file as Blob
 */
export async function downloadAndReassembleChunks(supabase, bucketName, filePath, totalChunks) {
  const chunks = []
  
  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = `${filePath}.chunk.${i}`
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(chunkPath)
    
    if (error) {
      throw new Error(`Failed to download chunk ${i}: ${error.message}`)
    }
    
    chunks.push(await data.arrayBuffer())
  }
  
  // Combine chunks into single Blob
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const combined = new Uint8Array(totalSize)
  let offset = 0
  
  for (const chunk of chunks) {
    combined.set(new Uint8Array(chunk), offset)
    offset += chunk.byteLength
  }
  
  return new Blob([combined])
}

/**
 * Cleans up chunk files from storage
 * @param {Object} supabase - Supabase client instance
 * @param {string} bucketName - Supabase storage bucket name
 * @param {string} filePath - Base file path
 * @param {number} totalChunks - Total number of chunks
 */
export async function cleanupChunks(supabase, bucketName, filePath, totalChunks) {
  const chunkPaths = []
  for (let i = 0; i < totalChunks; i++) {
    chunkPaths.push(`${filePath}.chunk.${i}`)
  }
  
  try {
    await supabase.storage
      .from(bucketName)
      .remove(chunkPaths)
  } catch (error) {
    console.warn('Failed to cleanup chunks:', error)
  }
}

