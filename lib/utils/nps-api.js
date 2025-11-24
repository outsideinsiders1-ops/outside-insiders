/**
 * NPS (National Park Service) API Client
 * Handles fetching parks data from the NPS API with pagination support
 */

/**
 * Fetches all parks from the NPS API
 * @param {string} apiKey - NPS API key
 * @param {Object} options - Additional options
 * @param {number} options.limit - Number of results per page (default: 50, max: 50)
 * @param {Function} options.onProgress - Callback for progress updates
 * @returns {Promise<Array>} Array of park objects from NPS API
 */
export async function fetchAllNPSParks(apiKey, options = {}) {
  const { limit = 50, onProgress } = options
  const baseUrl = 'https://developer.nps.gov/api/v1/parks'
  const allParks = []
  let start = 0
  let total = null
  let hasMore = true

  if (!apiKey) {
    throw new Error('NPS API key is required')
  }

  const headers = {
    'X-Api-Key': apiKey,
    'Accept': 'application/json'
  }

  while (hasMore) {
    try {
      const url = `${baseUrl}?limit=${limit}&start=${start}`
      
      if (onProgress) {
        onProgress({
          fetched: allParks.length,
          total: total || 'unknown',
          currentPage: Math.floor(start / limit) + 1
        })
      }

      console.log(`Fetching NPS API: ${url}`)
      const response = await fetch(url, { headers })

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 60
        console.warn(`Rate limit exceeded. Waiting ${retryAfter} seconds...`)
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
        continue
      }

      // Handle authentication errors
      if (response.status === 401) {
        const errorText = await response.text().catch(() => '')
        console.error('NPS API 401 Error:', errorText)
        throw new Error('Invalid NPS API key. Please check your API key.')
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        console.error(`NPS API error ${response.status}:`, errorText)
        throw new Error(`NPS API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format from NPS API')
      }

      allParks.push(...data.data)
      total = data.total || data.data.length
      start += limit

      // Check if we have more pages
      hasMore = data.data.length === limit && allParks.length < total

      // Rate limiting: wait 100ms between requests to stay under 1000/hour limit
      await new Promise(resolve => setTimeout(resolve, 100))

    } catch (error) {
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        // Already handled above
        continue
      }
      throw error
    }
  }

  if (onProgress) {
    onProgress({
      fetched: allParks.length,
      total: allParks.length,
      complete: true
    })
  }

  return allParks
}

/**
 * Fetches a single park by park code
 * @param {string} apiKey - NPS API key
 * @param {string} parkCode - NPS park code (e.g., 'acad', 'yell')
 * @returns {Promise<Object>} Park object from NPS API
 */
export async function fetchNPSParkByCode(apiKey, parkCode) {
  if (!apiKey) {
    throw new Error('NPS API key is required')
  }

  const url = `https://developer.nps.gov/api/v1/parks?parkCode=${encodeURIComponent(parkCode)}`
  const headers = {
    'X-Api-Key': apiKey,
    'Accept': 'application/json'
  }

  const response = await fetch(url, { headers })

  if (response.status === 401) {
    throw new Error('Invalid NPS API key')
  }

  if (!response.ok) {
    throw new Error(`NPS API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  if (!data.data || data.data.length === 0) {
    throw new Error(`Park not found: ${parkCode}`)
  }

  return data.data[0]
}
