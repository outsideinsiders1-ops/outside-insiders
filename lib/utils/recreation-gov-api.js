/**
 * Recreation.gov (RIDB) API Client
 * Handles fetching recreation facilities data from Recreation.gov API
 */

/**
 * Fetches recreation facilities from Recreation.gov API
 * @param {string} apiKey - Recreation.gov API key
 * @param {Object} options - Additional options
 * @param {number} options.limit - Number of results per page (default: 50, max: 50)
 * @param {string} options.state - Filter by state code (e.g., 'NC', 'GA')
 * @param {Function} options.onProgress - Callback for progress updates
 * @returns {Promise<Array>} Array of facility objects from Recreation.gov API
 */
export async function fetchRecreationFacilities(apiKey, options = {}) {
  const { limit = 50, state, onProgress } = options
  const baseUrl = 'https://ridb.recreation.gov/api/v1/facilities'
  const allFacilities = []
  let offset = 0
  let hasMore = true

  if (!apiKey) {
    throw new Error('Recreation.gov API key is required')
  }

  const headers = {
    'apikey': apiKey,
    'Accept': 'application/json'
  }

  while (hasMore) {
    try {
      let url = `${baseUrl}?limit=${limit}&offset=${offset}`
      
      if (state) {
        url += `&state=${encodeURIComponent(state)}`
      }

      if (onProgress) {
        onProgress({
          fetched: allFacilities.length,
          currentPage: Math.floor(offset / limit) + 1
        })
      }

      const response = await fetch(url, { headers })

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 60
        console.warn(`Rate limit exceeded. Waiting ${retryAfter} seconds...`)
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
        continue
      }

      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        throw new Error('Invalid Recreation.gov API key. Please check your API key.')
      }

      if (!response.ok) {
        throw new Error(`Recreation.gov API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.RECDATA || !Array.isArray(data.RECDATA)) {
        throw new Error('Invalid response format from Recreation.gov API')
      }

      allFacilities.push(...data.RECDATA)
      offset += limit

      // Check if we have more pages
      hasMore = data.RECDATA.length === limit

      // Rate limiting: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100))

    } catch (error) {
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        continue
      }
      throw error
    }
  }

  if (onProgress) {
    onProgress({
      fetched: allFacilities.length,
      total: allFacilities.length,
      complete: true
    })
  }

  return allFacilities
}

/**
 * Fetches addresses for a facility (contains state information)
 * @param {string} apiKey - Recreation.gov API key
 * @param {string} facilityId - Facility ID
 * @returns {Promise<Array>} Array of address objects
 */
export async function fetchRecreationFacilityAddresses(apiKey, facilityId) {
  if (!apiKey) {
    throw new Error('Recreation.gov API key is required')
  }

  const url = `https://ridb.recreation.gov/api/v1/facilities/${encodeURIComponent(facilityId)}/addresses`
  const headers = {
    'apikey': apiKey,
    'Accept': 'application/json'
  }

  const response = await fetch(url, { headers })

  if (response.status === 401 || response.status === 403) {
    throw new Error('Invalid Recreation.gov API key')
  }

  if (!response.ok) {
    // 404 means no addresses, which is fine
    if (response.status === 404) {
      return []
    }
    throw new Error(`Recreation.gov API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  return data.RECDATA || []
}

/**
 * Fetches a single facility by ID (includes more detailed info)
 * @param {string} apiKey - Recreation.gov API key
 * @param {string} facilityId - Facility ID
 * @returns {Promise<Object>} Facility object from Recreation.gov API
 */
export async function fetchRecreationFacilityById(apiKey, facilityId) {
  if (!apiKey) {
    throw new Error('Recreation.gov API key is required')
  }

  const url = `https://ridb.recreation.gov/api/v1/facilities/${encodeURIComponent(facilityId)}`
  const headers = {
    'apikey': apiKey,
    'Accept': 'application/json'
  }

  const response = await fetch(url, { headers })

  if (response.status === 401 || response.status === 403) {
    throw new Error('Invalid Recreation.gov API key')
  }

  if (!response.ok) {
    throw new Error(`Recreation.gov API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  return data
}
