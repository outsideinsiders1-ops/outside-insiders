/**
 * Shapefile Parser Utility
 * Parses Shapefile format (.shp) and ZIP archives containing shapefiles
 */

import * as shapefile from 'shapefile'
import JSZip from 'jszip'

/**
 * Parse a Shapefile from a File object
 * Handles both .shp files and ZIP archives
 * 
 * @param {File} file - File object (either .shp or .zip)
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
export async function parseShapefile(file) {
  const fileName = file.name.toLowerCase()
  
  if (fileName.endsWith('.zip')) {
    return parseShapefileZip(file)
  } else if (fileName.endsWith('.shp')) {
    return parseShapefileDirect(file)
  } else {
    throw new Error('File must be a .shp file or .zip archive containing shapefiles')
  }
}

/**
 * Parse a Shapefile from a ZIP archive
 * 
 * @param {File} zipFile - ZIP file containing shapefile components
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
async function parseShapefileZip(zipFile) {
  try {
    const zip = new JSZip()
    const zipData = await zipFile.arrayBuffer()
    const zipContents = await zip.loadAsync(zipData)

    // Find required shapefile components
    const shpFile = findFileInZip(zipContents, '.shp')
    const shxFile = findFileInZip(zipContents, '.shx')
    const dbfFile = findFileInZip(zipContents, '.dbf')

    if (!shpFile || !shxFile || !dbfFile) {
      throw new Error('ZIP archive must contain .shp, .shx, and .dbf files')
    }
    
    // Note: shx file is validated but not used directly - shapefile library uses it internally

    // Get file buffers
    const shpBuffer = await shpFile.async('arraybuffer')
    // Note: shx file is used internally by shapefile library, we don't need to pass it
    const dbfBuffer = await dbfFile.async('arraybuffer')

    // Parse shapefile
    const source = await shapefile.open(shpBuffer, dbfBuffer, {
      encoding: 'utf-8'
    })

    // Convert to GeoJSON
    const geojson = {
      type: 'FeatureCollection',
      features: []
    }

    let result
    while (!(result = await source.read()).done) {
      geojson.features.push(result.value)
    }

    return geojson
  } catch (error) {
    console.error('Error parsing shapefile ZIP:', error)
    throw new Error(`Failed to parse shapefile ZIP: ${error.message}`)
  }
}

/**
 * Parse a direct .shp file (requires separate .shx and .dbf files)
 * Note: This is less common as shapefiles are typically distributed as ZIPs
 * 
 * @param {File} shpFile - .shp file
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
async function parseShapefileDirect(shpFile) {
  try {
    // For direct .shp files, we need the associated .shx and .dbf files
    // This is a limitation - shapefiles are typically multi-file
    // We'll try to parse with just the .shp file, but it may not have attributes
    
    const shpBuffer = await shpFile.arrayBuffer()
    
    // Try to open without DBF (will have geometry but no attributes)
    const source = await shapefile.open(shpBuffer)

    const geojson = {
      type: 'FeatureCollection',
      features: []
    }

    let result
    while (!(result = await source.read()).done) {
      geojson.features.push(result.value)
    }

    return geojson
  } catch (error) {
    console.error('Error parsing direct shapefile:', error)
    throw new Error(`Failed to parse shapefile: ${error.message}. Note: Shapefiles typically require .shp, .shx, and .dbf files. Please upload as a ZIP archive.`)
  }
}

/**
 * Find a file in a ZIP archive by extension
 * 
 * @param {JSZip} zip - JSZip instance
 * @param {string} extension - File extension to find (.shp, .shx, .dbf)
 * @returns {JSZip.JSZipObject|null} File object or null if not found
 */
function findFileInZip(zip, extension) {
  for (const fileName in zip.files) {
    if (fileName.toLowerCase().endsWith(extension)) {
      return zip.files[fileName]
    }
  }
  return null
}

