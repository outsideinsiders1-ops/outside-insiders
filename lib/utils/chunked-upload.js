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
    // Check which chunks already exist to avoid re-uploading
    const directory = filePath.substring(0, filePath.lastIndexOf('/')) || ''
    const baseFileName = filePath.substring(filePath.lastIndexOf('/') + 1)
    
    // Extract original filename from baseFileName (remove timestamp prefix)
    // baseFileName format: {timestamp}-{originalFileName}
    // Example: "1763781296418-Parkserve_Shapefiles_05212025.zip"
    // file.name is the original filename without timestamp: "Parkserve_Shapefiles_05212025.zip"
    const originalFileName = file.name || baseFileName.replace(/^\d+-/, '') // Remove timestamp prefix if file.name not available
    const fileNameWithoutExt = originalFileName.replace(/\.[^/.]+$/, '')
    const fileExt = originalFileName.match(/\.[^/.]+$/) ? originalFileName.match(/\.[^/.]+$/)[0] : ''
    
    // Escape special regex characters in filename parts for regex matching
    const escapedFileNameWithoutExt = fileNameWithoutExt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const escapedFileExt = fileExt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    
    console.log(`Checking for existing chunks. Original filename: "${originalFileName}", Base filename: "${baseFileName}"`)
    
    let existingChunks = new Set()
    let chunkFilePattern = null
    
    try {
      const { data: files } = await supabase.storage
        .from(bucketName)
        .list(directory)
      
      if (files && files.length > 0) {
        // First, try exact match with current filePath
        // Pattern: "1763781296418-Parkserve_Shapefiles_05212025.zip.chunk.0"
        const exactPattern = new RegExp(`^${baseFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.chunk\\.\\d+$`)
        let foundChunks = files.filter(f => exactPattern.test(f.name))
        
        // If no exact match, try to find chunks with similar filename (same original name, different timestamp)
        // Pattern: "{any_timestamp}-Parkserve_Shapefiles_05212025.zip.chunk.{number}"
        if (foundChunks.length === 0) {
          // Match any timestamp followed by the original filename
          // Pattern matches: "1763781296418-Parkserve_Shapefiles_05212025.zip.chunk.0"
          const namePattern = new RegExp(`^\\d+-${escapedFileNameWithoutExt}${escapedFileExt}\\.chunk\\.\\d+$`)
          foundChunks = files.filter(f => {
            const matches = namePattern.test(f.name)
            if (matches) {
              console.log(`Found matching chunk: ${f.name}`)
            }
            return matches
          })
          
          if (foundChunks.length > 0) {
            // Found chunks from a previous upload - use those instead
            console.log(`Found ${foundChunks.length} chunks from a previous upload of the same file: "${originalFileName}". Using existing chunks.`)
            chunkFilePattern = namePattern
            
            // Extract the base path from the first found chunk (to use for reassembly)
            const firstChunk = foundChunks[0]
            const previousBasePath = firstChunk.name.replace(/\.chunk\.\d+$/, '')
            console.log(`Previous upload detected. Base path: ${previousBasePath}`)
            // Note: We'll continue using the new filePath for new chunks, but can reference old ones
          } else {
            console.log(`No existing chunks found for pattern: ^\\d+-${escapedFileNameWithoutExt}${escapedFileExt}\\.chunk\\.\\d+$`)
          }
        } else {
          chunkFilePattern = exactPattern
        }
        
        // Extract chunk numbers from found files
        foundChunks.forEach(file => {
          const match = file.name.match(/\.chunk\.(\d+)$/)
          if (match) {
            existingChunks.add(parseInt(match[1]))
          }
        })
      }
    } catch (error) {
      console.warn('Could not check for existing chunks:', error.message)
    }
    
    if (existingChunks.size > 0) {
      console.log(`Found ${existingChunks.size} existing chunks. Will skip those and upload ${totalChunks - existingChunks.size} missing chunks.`)
      
      // If we found chunks from a previous upload, we should use that base path
      if (chunkFilePattern && existingChunks.size >= totalChunks * 0.9) {
        // If 90%+ of chunks exist, assume the file was already uploaded
        console.log(`File appears to be already uploaded (${existingChunks.size}/${totalChunks} chunks exist).`)
        // Return success but indicate file was already uploaded
        return { success: true, alreadyUploaded: true, existingChunks: existingChunks.size }
      }
    }
    
    // Upload chunks sequentially with retry logic
    for (let chunkNumber = 0; chunkNumber < totalChunks; chunkNumber++) {
      // Skip if chunk already exists
      if (existingChunks.has(chunkNumber)) {
        if (onProgress) {
          const bytesUploaded = (chunkNumber + 1) * chunkSize
          onProgress({
            chunkNumber: chunkNumber + 1,
            totalChunks,
            bytesUploaded: Math.min(bytesUploaded, file.size),
            totalBytes: file.size,
            percentage: Math.round((Math.min(bytesUploaded, file.size) / file.size) * 100),
            skipped: true
          })
        }
        continue
      }
      
      // Skip if chunk already exists
      if (existingChunks.has(chunkNumber)) {
        if (onProgress) {
          const bytesUploaded = (chunkNumber + 1) * chunkSize
          onProgress({
            chunkNumber: chunkNumber + 1,
            totalChunks,
            bytesUploaded: Math.min(bytesUploaded, file.size),
            totalBytes: file.size,
            percentage: Math.round((Math.min(bytesUploaded, file.size) / file.size) * 100),
            skipped: true
          })
        }
        continue
      }
      
      const start = chunkNumber * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)
      
      const chunkPath = `${filePath}.chunk.${chunkNumber}`
      
      // Retry logic for each chunk
      let retries = 3
      
      while (retries > 0) {
        try {
          // Upload chunk with upsert enabled to allow retries
          const { error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(chunkPath, chunk, {
              cacheControl: '3600',
              upsert: true // Allow overwriting on retry
            })

          if (uploadError) {
            retries--
            
            if (retries > 0) {
              // Exponential backoff: wait 1s, 2s, 4s
              const waitTime = Math.pow(2, 3 - retries) * 1000
              console.warn(`Chunk ${chunkNumber + 1} upload failed, retrying in ${waitTime}ms... (${retries} retries left)`)
              await new Promise(resolve => setTimeout(resolve, waitTime))
              continue
            } else {
              throw new Error(`Failed to upload chunk ${chunkNumber + 1}/${totalChunks} after 3 attempts: ${uploadError.message}`)
            }
          }
          
          // Success - break out of retry loop
          break
        } catch (error) {
          retries--
          
          if (retries === 0) {
            throw new Error(`Failed to upload chunk ${chunkNumber + 1}/${totalChunks}: ${error.message}`)
          }
          
          // Exponential backoff
          const waitTime = Math.pow(2, 3 - retries) * 1000
          console.warn(`Chunk ${chunkNumber + 1} upload error, retrying in ${waitTime}ms... (${retries} retries left)`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
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
      
      // Small delay between chunks to avoid overwhelming the server
      if (chunkNumber < totalChunks - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
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

