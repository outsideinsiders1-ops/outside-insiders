'use client'

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import './AdminPanel.css';

// Initialize Supabase client (with fallback for build time)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null

function AdminPanel() {
  // State for active tab
  const [activeTab, setActiveTab] = useState('scraper');

  // Geographic reference data
  const [states, setStates] = useState([]);
  const [metros, setMetros] = useState([]);
  const [counties, setCounties] = useState([]);
  const [cities, setCities] = useState([]);
  const [loadingGeo, setLoadingGeo] = useState(true);

  // Web Scraper state
  const [selectedState, setSelectedState] = useState('');
  const [selectedMetro, setSelectedMetro] = useState('');
  const [selectedCounty, setSelectedCounty] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [scrapeType, setScrapeType] = useState('state');
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeResult, setScrapeResult] = useState(null);
  const [scrapeError, setScrapeError] = useState(null);

  // Metro details (counties and cities in selected metro)
  const [metroDetails, setMetroDetails] = useState({ counties: 0, cities: 0 });

  // File Upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadSourceType, setUploadSourceType] = useState('State Agency');
  const [uploadState, setUploadState] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  // API Sync state
  const [syncApiUrl, setSyncApiUrl] = useState('');
  const [syncSourceType, setSyncSourceType] = useState('NPS');
  const [syncApiKey, setSyncApiKey] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState(null);

  // Data Quality state
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityAnalysis, setQualityAnalysis] = useState(null);
  const [qualityError, setQualityError] = useState(null);
  const [qualityFilters, setQualityFilters] = useState({
    state: '',
    agency: '',
    dataSource: ''
  });
  const [filteredParks, setFilteredParks] = useState([]);
  const [selectedParks, setSelectedParks] = useState(new Set());
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ==================== LOAD GEOGRAPHIC DATA ====================
  useEffect(() => {
    loadStates();
  }, []);

  // Load all states
  const loadStates = async () => {
    if (!supabase) {
      console.error('Supabase client not initialized')
      setLoadingGeo(false)
      return
    }
    
    setLoadingGeo(true);
    try {
      const { data, error } = await supabase
        .from('geographic_entities')
        .select('id, name, state_code')
        .eq('entity_type', 'state')
        .order('name');

      if (error) throw error;

      if (data && data.length > 0) {
        setStates(data);
      }
    } catch (error) {
      console.error('Error loading states:', error);
    } finally {
      setLoadingGeo(false);
    }
  };

  // Load metros for selected state
  const loadMetros = async (stateCode) => {
    if (!supabase) return
    try {
      const { data, error } = await supabase
        .from('geographic_entities')
        .select('id, name, metro_id')
        .eq('entity_type', 'metro')
        .eq('state_code', stateCode)
        .order('name');

      if (error) throw error;

      if (data && data.length > 0) {
        setMetros(data);
      } else {
        setMetros([]);
      }
    } catch (error) {
      console.error('Error loading metros:', error);
      setMetros([]);
    }
  };

  // Load counties for selected state
  const loadCounties = async (stateCode) => {
    if (!supabase) return
    try {
      const { data, error } = await supabase
        .from('geographic_entities')
        .select('id, name')
        .eq('entity_type', 'county')
        .eq('state_code', stateCode)
        .order('name');

      if (error) throw error;

      if (data && data.length > 0) {
        setCounties(data);
      } else {
        setCounties([]);
      }
    } catch (error) {
      console.error('Error loading counties:', error);
      setCounties([]);
    }
  };

  // Load cities for selected state
  const loadCities = async (stateCode) => {
    if (!supabase) return
    try {
      const { data, error } = await supabase
        .from('geographic_entities')
        .select('id, name')
        .eq('entity_type', 'city')
        .eq('state_code', stateCode)
        .order('name');

      if (error) throw error;

      if (data && data.length > 0) {
        setCities(data);
      } else {
        setCities([]);
      }
    } catch (error) {
      console.error('Error loading cities:', error);
      setCities([]);
    }
  };

  // Get metro details (count of counties and cities)
  const loadMetroDetails = async (metroId, stateCode) => {
    try {
      if (!supabase) return
      
      // Count counties in this metro
      const { data: countyData } = await supabase
        .from('geographic_entities')
        .select('id')
        .eq('entity_type', 'county')
        .eq('metro_id', metroId)
        .eq('state_code', stateCode);

      // Count cities in this metro
      const { data: cityData } = await supabase
        .from('geographic_entities')
        .select('id')
        .eq('entity_type', 'city')
        .eq('metro_id', metroId)
        .eq('state_code', stateCode);

      setMetroDetails({
        counties: countyData ? countyData.length : 0,
        cities: cityData ? cityData.length : 0
      });
    } catch (error) {
      console.error('Error loading metro details:', error);
      setMetroDetails({ counties: 0, cities: 0 });
    }
  };

  // Handle state selection change
  const handleStateChange = async (stateName, stateCode) => {
    setSelectedState(stateName);
    setSelectedMetro('');
    setSelectedCounty('');
    setSelectedCity('');
    setMetroDetails({ counties: 0, cities: 0 });
    
    if (stateCode) {
      // Load all geographic data for this state
      await loadMetros(stateCode);
      await loadCounties(stateCode);
      await loadCities(stateCode);
    } else {
      setMetros([]);
      setCounties([]);
      setCities([]);
    }
  };

  // Handle metro selection
  const handleMetroChange = async (metroName) => {
    setSelectedMetro(metroName);
    
    if (metroName) {
      // Find the selected metro
      const metro = metros.find(m => m.name === metroName);
      const state = states.find(s => s.name === selectedState);
      
      if (metro && state) {
        await loadMetroDetails(metro.metro_id, state.state_code);
      }
    } else {
      setMetroDetails({ counties: 0, cities: 0 });
    }
  };

  // Handle scrape type change
  const handleScrapeTypeChange = (type) => {
    setScrapeType(type);
    // Reset selections when changing type
    setSelectedMetro('');
    setSelectedCounty('');
    setSelectedCity('');
    setMetroDetails({ counties: 0, cities: 0 });
  };

  // ==================== WEB SCRAPER ====================
  const handleScrape = async () => {
    // Validate selections based on scrape type
    let requestBody = {
      type: scrapeType,
      state: selectedState
    };
    
    if (scrapeType === 'state') {
      if (!selectedState) {
        setScrapeError('Please select a state');
        return;
      }
      requestBody.name = selectedState;
      
    } else if (scrapeType === 'metro') {
      if (!selectedMetro) {
        setScrapeError('Please select a metro area');
        return;
      }
      const metro = metros.find(m => m.name === selectedMetro);
      requestBody.name = selectedMetro;
      requestBody.metroId = metro?.metro_id;
      
    } else if (scrapeType === 'county') {
      if (!selectedCounty) {
        setScrapeError('Please select a county');
        return;
      }
      requestBody.name = selectedCounty;
      
    } else if (scrapeType === 'city') {
      if (!selectedCity) {
        setScrapeError('Please select a city');
        return;
      }
      requestBody.name = selectedCity;
    }

    setScrapeLoading(true);
    setScrapeError(null);
    setScrapeResult(null);

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setScrapeResult(data);
      } else {
        setScrapeError(data.error || 'Scraping failed');
      }
    } catch (err) {
      setScrapeError(`Error: ${err.message}`);
    } finally {
      setScrapeLoading(false);
    }
  };

  // ==================== FILE UPLOAD HANDLER ====================
  const handleFileUpload = async () => {
    if (!uploadFile) {
      setUploadError('Please select a file');
      return;
    }

    if (!supabase) {
      setUploadError('Supabase client not initialized');
      return;
    }

    setUploadLoading(true);
    setUploadError(null);
    setUploadResult(null);

    let filePath = null; // Track file path for cleanup

    try {
      // Step 1: Upload file to Supabase Storage (bypasses Vercel 4.5MB limit)
      const fileName = `${Date.now()}-${uploadFile.name}`;
      filePath = `uploads/${fileName}`;
      
      console.log(`Uploading ${uploadFile.name} (${(uploadFile.size / 1024 / 1024).toFixed(2)} MB) to Supabase Storage...`);
      
      const { error: uploadError } = await supabase.storage
        .from('park-uploads')
        .upload(filePath, uploadFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        // If bucket doesn't exist, try to create it (this will fail if user doesn't have permissions)
        if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('not found')) {
          setUploadError('Storage bucket "park-uploads" not found. Please create it in Supabase Dashboard > Storage.');
          return;
        }
        throw uploadError;
      }

      // Step 2: Get public URL or create signed URL
      const { data: urlData } = supabase.storage
        .from('park-uploads')
        .getPublicUrl(filePath);

      const fileUrl = urlData.publicUrl;

      console.log('File uploaded to storage, processing...');

      // Step 3: Call API with file URL instead of file data
      const formData = new FormData();
      formData.append('fileUrl', fileUrl);
      formData.append('sourceType', uploadSourceType);
      formData.append('sourceName', uploadFile.name);
      formData.append('filePath', filePath); // For cleanup later
      if (uploadState) {
        formData.append('defaultState', uploadState.trim());
      }

      // Set a longer timeout for large files (5 minutes)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 minutes

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = `Upload failed with status ${response.status}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          // If response isn't JSON, use status text
          errorMessage = response.statusText || errorMessage
        }
        setUploadError(errorMessage)
        return
      }

      const data = await response.json()

      if (data.success) {
        setUploadResult(data)
        setUploadFile(null) // Reset file input
        // Reset file input element
        const fileInput = document.querySelector('input[type="file"]')
        if (fileInput) fileInput.value = ''
        
        // Optional: Clean up file from storage after successful processing
        // Uncomment if you want to delete files after processing
        // try {
        //   await supabase.storage.from('park-uploads').remove([filePath])
        // } catch (cleanupError) {
        //   console.warn('Failed to cleanup storage file:', cleanupError)
        // }
      } else {
        setUploadError(data.error || 'Upload failed')
        // Clean up uploaded file on error
        if (filePath) {
          try {
            await supabase.storage.from('park-uploads').remove([filePath])
          } catch (cleanupError) {
            console.warn('Failed to cleanup storage file on error:', cleanupError)
          }
        }
      }
    } catch (err) {
      console.error('Upload error:', err)
      
      // Clean up uploaded file on error
      if (filePath) {
        try {
          await supabase.storage.from('park-uploads').remove([filePath])
        } catch (cleanupError) {
          console.warn('Failed to cleanup storage file on error:', cleanupError)
        }
      }
      
      if (err.name === 'AbortError') {
        setUploadError('Upload timed out after 5 minutes. The file may be too large. Please try splitting it into smaller files or contact support.')
      } else {
        setUploadError(`Network error: ${err.message}. Please check your connection and try again.`)
      }
    } finally {
      setUploadLoading(false)
    }
  };

  // ==================== API SYNC HANDLER ====================
  const handleApiSync = async () => {
    if (!syncApiUrl.trim()) {
      setSyncError('Please enter an API URL');
      return;
    }

    if (!syncSourceType) {
      setSyncError('Please select a source type');
      return;
    }

    setSyncLoading(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiUrl: syncApiUrl.trim(),
          sourceType: syncSourceType,
          apiKey: syncApiKey.trim() || undefined,
        }),
      });

      const data = await response.json();

      // Always clear previous results first
      setSyncResult(null);
      setSyncError(null);

      if (!response.ok) {
        // Handle different error types
        let errorMessage = data.error || `Sync failed with status ${response.status}`;
        
        if (data.details) {
          errorMessage += `: ${data.details}`;
        }
        
        if (response.status === 400) {
          // Validation error - show helpful message
          if (data.example) {
            errorMessage += `\n\nExample: ${JSON.stringify(data.example, null, 2)}`;
          }
        } else if (response.status === 501) {
          // Not implemented yet - show as error, not success
          errorMessage = 'API Sync is not yet implemented. This endpoint is coming soon.';
          if (data.note) {
            errorMessage += `\n\n${data.note}`;
          }
          if (data.nextSteps) {
            errorMessage += `\n\nPlanned features:\n${data.nextSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;
          }
          setSyncError(errorMessage);
          return; // Don't show as success
        } else if (response.status === 500) {
          // Server error
          errorMessage = `Server error: ${data.message || errorMessage}`;
          if (data.details && process.env.NODE_ENV === 'development') {
            errorMessage += `\n\nDetails: ${data.details}`;
          }
        }
        
        setSyncError(errorMessage);
        return;
      }

      // Only show success if response.ok AND data.success is true
      if (data.success === true) {
        setSyncResult(data);
      } else {
        // Even if response.ok, if success is false, show as error
        setSyncError(data.error || data.message || 'Sync failed');
      }
    } catch (err) {
      console.error('API Sync error:', err);
      
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setSyncError('Network error: Could not connect to server. Please check your connection and try again.');
      } else {
        setSyncError(`Error: ${err.message}. Please try again.`);
      }
    } finally {
      setSyncLoading(false);
    }
  };

  // ==================== DATA QUALITY HANDLERS ====================
  const loadQualityAnalysis = async () => {
    setQualityLoading(true);
    setQualityError(null);

    try {
      const params = new URLSearchParams();
      if (qualityFilters.state) params.append('state', qualityFilters.state);
      if (qualityFilters.agency) params.append('agency', qualityFilters.agency);
      if (qualityFilters.dataSource) params.append('data_source', qualityFilters.dataSource);

      const response = await fetch(`/api/admin/data-quality?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        setQualityError(data.error || 'Failed to load quality analysis');
        return;
      }

      if (data.success) {
        setQualityAnalysis(data.analysis);
      } else {
        setQualityError(data.error || 'Failed to load quality analysis');
      }
    } catch (err) {
      console.error('Quality analysis error:', err);
      setQualityError(`Error: ${err.message}`);
    } finally {
      setQualityLoading(false);
    }
  };

  const loadFilteredParks = async (filterCriteria) => {
    setQualityLoading(true);
    setQualityError(null);

    try {
      const params = new URLSearchParams();
      if (qualityFilters.state) params.append('state', qualityFilters.state);
      if (qualityFilters.agency) params.append('agency', qualityFilters.agency);
      if (qualityFilters.dataSource) params.append('data_source', qualityFilters.dataSource);
      params.append('action', 'filter');

      if (filterCriteria.nameKeywords) {
        params.append('nameKeywords', filterCriteria.nameKeywords.join(','));
      }
      if (filterCriteria.maxAcres !== undefined) {
        params.append('maxAcres', filterCriteria.maxAcres);
      }
      if (filterCriteria.minAcres !== undefined) {
        params.append('minAcres', filterCriteria.minAcres);
      }
      if (filterCriteria.missingFields) {
        params.append('missingFields', filterCriteria.missingFields.join(','));
      }

      const response = await fetch(`/api/admin/data-quality?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        setQualityError(data.error || 'Failed to load filtered parks');
        return;
      }

      if (data.success) {
        setFilteredParks(data.filteredParks || []);
        setSelectedParks(new Set()); // Clear selection
      } else {
        setQualityError(data.error || 'Failed to load filtered parks');
      }
    } catch (err) {
      console.error('Filter parks error:', err);
      setQualityError(`Error: ${err.message}`);
    } finally {
      setQualityLoading(false);
    }
  };

  const handleDeleteParks = async () => {
    if (selectedParks.size === 0) {
      alert('Please select parks to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedParks.size} park(s)? This cannot be undone.`)) {
      return;
    }

    setDeleteLoading(true);

    try {
      const response = await fetch('/api/admin/data-quality', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parkIds: Array.from(selectedParks)
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setQualityError(data.error || 'Failed to delete parks');
        return;
      }

      if (data.success) {
        alert(`Successfully deleted ${data.deleted} park(s)`);
        setSelectedParks(new Set());
        // Reload analysis
        loadQualityAnalysis();
        // Reload filtered parks if any
        if (filteredParks.length > 0) {
          loadFilteredParks({});
        }
      }
    } catch (err) {
      console.error('Delete parks error:', err);
      setQualityError(`Error: ${err.message}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggleParkSelection = (parkId) => {
    const newSelection = new Set(selectedParks);
    if (newSelection.has(parkId)) {
      newSelection.delete(parkId);
    } else {
      newSelection.add(parkId);
    }
    setSelectedParks(newSelection);
  };

  const selectAllParks = () => {
    if (selectedParks.size === filteredParks.length) {
      setSelectedParks(new Set());
    } else {
      setSelectedParks(new Set(filteredParks.map(p => p.id)));
    }
  };

  // ==================== RENDER ====================
  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>🏞️ Outside Insiders Admin Panel</h1>
        <p>Manage park data sources</p>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          className={`tab ${activeTab === 'scraper' ? 'active' : ''}`}
          onClick={() => setActiveTab('scraper')}
        >
          🌐 Web Scraper
        </button>
        <button
          className={`tab ${activeTab === 'api' ? 'active' : ''}`}
          onClick={() => setActiveTab('api')}
        >
          🔌 API Manager
        </button>
        <button
          className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          📁 File Upload
        </button>
        <button
          className={`tab ${activeTab === 'quality' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('quality');
            if (!qualityAnalysis) {
              loadQualityAnalysis();
            }
          }}
        >
          🔍 Data Quality
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        
        {/* ==================== WEB SCRAPER TAB ==================== */}
        {activeTab === 'scraper' && (
          <div className="section">
            <h2>Web Scraper</h2>
            <p className="section-description">
              Scrape park data from websites. Priority: 40 (can't overwrite API or file data)
            </p>

            {/* Step 1: Select State */}
            <div className="form-group">
              <label>1️⃣ Select State:</label>
              <select 
                value={selectedState} 
                onChange={(e) => {
                  const state = states.find(s => s.name === e.target.value);
                  handleStateChange(e.target.value, state?.state_code);
                }}
                disabled={scrapeLoading || loadingGeo}
              >
                <option value="">-- Select a State --</option>
                {states.map(state => (
                  <option key={state.id} value={state.name}>
                    {state.name} ({state.state_code})
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2: Select Scrape Type */}
            {selectedState && (
              <div className="form-group">
                <label>2️⃣ What to Scrape:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ cursor: 'pointer', padding: '5px' }}>
                    <input
                      type="radio"
                      value="state"
                      checked={scrapeType === 'state'}
                      onChange={(e) => handleScrapeTypeChange(e.target.value)}
                      disabled={scrapeLoading}
                    />
                    <span style={{ marginLeft: '8px' }}>
                      <strong>State Parks</strong> - All state parks in {selectedState}
                    </span>
                  </label>
                  
                  <label style={{ cursor: 'pointer', padding: '5px', background: '#e8f4f8' }}>
                    <input
                      type="radio"
                      value="metro"
                      checked={scrapeType === 'metro'}
                      onChange={(e) => handleScrapeTypeChange(e.target.value)}
                      disabled={scrapeLoading}
                    />
                    <span style={{ marginLeft: '8px' }}>
                      <strong>Metro Area</strong> - All counties + cities in a metro (bulk)
                    </span>
                  </label>
                  
                  <label style={{ cursor: 'pointer', padding: '5px' }}>
                    <input
                      type="radio"
                      value="county"
                      checked={scrapeType === 'county'}
                      onChange={(e) => handleScrapeTypeChange(e.target.value)}
                      disabled={scrapeLoading}
                    />
                    <span style={{ marginLeft: '8px' }}>
                      <strong>Single County</strong> - One specific county
                    </span>
                  </label>
                  
                  <label style={{ cursor: 'pointer', padding: '5px' }}>
                    <input
                      type="radio"
                      value="city"
                      checked={scrapeType === 'city'}
                      onChange={(e) => handleScrapeTypeChange(e.target.value)}
                      disabled={scrapeLoading}
                    />
                    <span style={{ marginLeft: '8px' }}>
                      <strong>Single City</strong> - One specific city
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* Step 3: Select Metro (if metro type selected) */}
            {scrapeType === 'metro' && selectedState && (
              <div className="form-group">
                <label>3️⃣ Select Metro Area:</label>
                <select 
                  value={selectedMetro} 
                  onChange={(e) => handleMetroChange(e.target.value)}
                  disabled={scrapeLoading || metros.length === 0}
                >
                  <option value="">-- Select a Metro Area --</option>
                  {metros.map(metro => (
                    <option key={metro.id} value={metro.name}>
                      {metro.name}
                    </option>
                  ))}
                </select>
                
                {selectedMetro && metroDetails && (
                  <div style={{ marginTop: '10px', padding: '10px', background: '#f0f7ed', borderRadius: '5px' }}>
                    <strong>This metro includes:</strong>
                    <ul style={{ margin: '5px 0' }}>
                      <li>{metroDetails.counties} counties</li>
                      <li>{metroDetails.cities} cities</li>
                      <li><strong>Total: {metroDetails.counties + metroDetails.cities} entities to scrape</strong></li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Select County (if county type selected) */}
            {scrapeType === 'county' && selectedState && (
              <div className="form-group">
                <label>3️⃣ Select County:</label>
                <select 
                  value={selectedCounty} 
                  onChange={(e) => setSelectedCounty(e.target.value)}
                  disabled={scrapeLoading || counties.length === 0}
                >
                  <option value="">-- Select a County --</option>
                  {counties.map(county => (
                    <option key={county.id} value={county.name}>
                      {county.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Step 3: Select City (if city type selected) */}
            {scrapeType === 'city' && selectedState && (
              <div className="form-group">
                <label>3️⃣ Select City:</label>
                <select 
                  value={selectedCity} 
                  onChange={(e) => setSelectedCity(e.target.value)}
                  disabled={scrapeLoading || cities.length === 0}
                >
                  <option value="">-- Select a City --</option>
                  {cities.map(city => (
                    <option key={city.id} value={city.name}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Scrape Button */}
            <button
              onClick={handleScrape}
              disabled={
                scrapeLoading || 
                !selectedState ||
                (scrapeType === 'metro' && !selectedMetro) ||
                (scrapeType === 'county' && !selectedCounty) ||
                (scrapeType === 'city' && !selectedCity)
              }
              className="primary-button"
              style={{ marginTop: '20px' }}
            >
              {scrapeLoading ? '🔄 Scraping...' : '🚀 Start Scrape'}
            </button>

            {/* Ready to scrape message */}
            {selectedState && (
              <div style={{ marginTop: '10px', padding: '15px', background: '#f8f9fa', borderRadius: '5px' }}>
                <strong>Ready to scrape:</strong>
                {scrapeType === 'state' && (
                  <p>All state parks in {selectedState}</p>
                )}
                {scrapeType === 'metro' && selectedMetro && (
                  <p>{metroDetails.counties + metroDetails.cities} locations in {selectedMetro}</p>
                )}
                {scrapeType === 'county' && selectedCounty && (
                  <p>County parks in {selectedCounty}, {selectedState}</p>
                )}
                {scrapeType === 'city' && selectedCity && (
                  <p>City parks in {selectedCity}, {selectedState}</p>
                )}
              </div>
            )}

            {/* Results */}
            {scrapeError && (
              <div className="alert alert-error">
                ❌ {scrapeError}
              </div>
            )}

            {scrapeResult && (
              <div className="alert alert-success">
                ✅ Success! {scrapeResult.message}
                {scrapeResult.parksFound !== undefined && (
                  <div className="result-details">
                    <p>Parks found: {scrapeResult.parksFound}</p>
                    <p>Parks added: {scrapeResult.parksAdded || 0}</p>
                    <p>Parks updated: {scrapeResult.parksUpdated || 0}</p>
                    <p>Parks skipped (protected): {scrapeResult.parksSkipped || 0}</p>
                  </div>
                )}
              </div>
            )}

            {/* Data Summary */}
            <div style={{ marginTop: '30px', padding: '20px', background: '#e8f4f8', borderRadius: '8px' }}>
              <h4>📊 Geographic Data Summary:</h4>
              <ul style={{ lineHeight: '1.8' }}>
                <li>Total States: {states.length}</li>
                {selectedState && (
                  <>
                    <li>Metros in {selectedState}: {metros.length}</li>
                    <li>Counties in {selectedState}: {counties.length}</li>
                    <li>Cities in {selectedState}: {cities.length}</li>
                  </>
                )}
              </ul>
            </div>

            {/* Quality Scoring Info */}
            <div style={{ marginTop: '20px', padding: '20px', background: '#f0f7ed', borderRadius: '8px' }}>
              <h4>🎯 Data Protection System:</h4>
              <ul style={{ lineHeight: '1.8' }}>
                <li><strong>Quality Score:</strong> 0-100 points based on completeness</li>
                <li><strong>Priority:</strong> API (100) → Files (80) → Scrapes (40)</li>
                <li><strong>Protection:</strong> High-quality data never overwritten</li>
                <li><strong>Updates:</strong> Only if quality improves</li>
              </ul>
            </div>
          </div>
        )}

        {/* ==================== API MANAGER TAB ==================== */}
        {activeTab === 'api' && (
          <div className="section">
            <h2>API Manager</h2>
            <p className="section-description">
              Connect to official park APIs. Priority: 90-100 (highest protection)
            </p>

            <div className="form-group">
              <label>1️⃣ Select Source Type:</label>
              <select 
                value={syncSourceType} 
                onChange={(e) => setSyncSourceType(e.target.value)}
                disabled={syncLoading}
              >
                <option value="NPS">NPS (National Park Service) - Priority: 100</option>
                <option value="Recreation.gov">Recreation.gov - Priority: 95</option>
                <option value="State Agency">State Agency API - Priority: 90</option>
                <option value="Federal Agency">Federal Agency API - Priority: 90</option>
                <option value="County Agency">County Agency API - Priority: 85</option>
                <option value="City Agency">City Agency API - Priority: 85</option>
              </select>
            </div>

            <div className="form-group">
              <label>2️⃣ Enter API URL:</label>
              <input
                type="url"
                value={syncApiUrl}
                onChange={(e) => {
                  setSyncApiUrl(e.target.value);
                  setSyncError(null);
                }}
                placeholder="https://api.nps.gov/api/v1/parks"
                disabled={syncLoading}
                style={{ width: '100%', padding: '8px', marginTop: '5px', fontFamily: 'monospace' }}
              />
              <p style={{ marginTop: '5px', fontSize: '0.9rem', color: '#666' }}>
                <strong>Examples:</strong>
                <br />• NPS: <code>https://api.nps.gov/api/v1/parks</code>
                <br />• Recreation.gov: <code>https://ridb.recreation.gov/api/v1/facilities</code>
                <br />• State APIs: Check your state's park agency website
              </p>
            </div>

            <div className="form-group">
              <label>3️⃣ API Key (if required):</label>
              <input
                type="password"
                value={syncApiKey}
                onChange={(e) => setSyncApiKey(e.target.value)}
                placeholder="Enter API key if required by the API"
                disabled={syncLoading}
                style={{ width: '100%', padding: '8px', marginTop: '5px' }}
              />
              <p style={{ marginTop: '5px', fontSize: '0.9rem', color: '#666' }}>
                <strong>Note:</strong> Some APIs require authentication. Enter your API key here if needed.
              </p>
            </div>

            <div className="form-group">
              <button
                onClick={handleApiSync}
                disabled={!syncApiUrl.trim() || !syncSourceType || syncLoading}
                className="primary-button"
              >
                {syncLoading ? '⏳ Syncing...' : '🔌 Sync API'}
              </button>
            </div>

            {syncError && (
              <div className="error-message" style={{ marginTop: '20px', padding: '15px', background: '#fee', borderRadius: '8px', whiteSpace: 'pre-wrap' }}>
                <strong>❌ Error:</strong>
                <div style={{ marginTop: '10px', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                  {syncError}
                </div>
              </div>
            )}

            {syncResult && (
              <div className="success-message" style={{ marginTop: '20px', padding: '20px', background: '#f0f7ed', borderRadius: '8px' }}>
                {syncResult.success ? (
                  <>
                    <h3 style={{ marginTop: 0 }}>✅ Sync Complete!</h3>
                    <ul style={{ textAlign: 'left', display: 'inline-block' }}>
                      {syncResult.parksFound !== undefined && (
                        <li><strong>Parks Found:</strong> {syncResult.parksFound}</li>
                      )}
                      {syncResult.parksAdded !== undefined && (
                        <li><strong>Parks Added:</strong> {syncResult.parksAdded}</li>
                      )}
                      {syncResult.parksUpdated !== undefined && (
                        <li><strong>Parks Updated:</strong> {syncResult.parksUpdated}</li>
                      )}
                    </ul>
                  </>
                ) : (
                  <>
                    <h3 style={{ marginTop: 0 }}>ℹ️ API Sync Status</h3>
                    <p>{syncResult.message || 'API sync endpoint received your request'}</p>
                    {syncResult.received && (
                      <div style={{ marginTop: '10px', padding: '10px', background: '#fff', borderRadius: '5px' }}>
                        <strong>Received:</strong>
                        <ul style={{ textAlign: 'left', marginTop: '5px' }}>
                          <li>URL: {syncResult.received.apiUrl}</li>
                          <li>Source Type: {syncResult.received.sourceType}</li>
                          <li>Has API Key: {syncResult.received.hasApiKey ? 'Yes' : 'No'}</li>
                        </ul>
                      </div>
                    )}
                    {syncResult.note && (
                      <p style={{ marginTop: '10px', fontStyle: 'italic', color: '#666' }}>
                        {syncResult.note}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={{ marginTop: '30px', padding: '20px', background: '#e8f4f8', borderRadius: '8px' }}>
              <h4>📋 API Sync Features (Coming Soon):</h4>
              <ul style={{ lineHeight: '1.8', textAlign: 'left' }}>
                <li><strong>LLM-Powered Intelligence:</strong> Automatically analyzes API structure and suggests optimal endpoints</li>
                <li><strong>Smart Field Mapping:</strong> Maps API response fields to park schema automatically</li>
                <li><strong>Deduplication:</strong> Intelligently merges with existing park data</li>
                <li><strong>Priority Protection:</strong> API data has highest priority (90-100) and won't be overwritten</li>
                <li><strong>Error Recovery:</strong> Handles API errors gracefully and provides detailed feedback</li>
              </ul>
            </div>
          </div>
        )}

        {/* ==================== FILE UPLOAD TAB ==================== */}
        {activeTab === 'upload' && (
          <div className="section">
            <h2>File Upload</h2>
            <p className="section-description">
              Upload GeoJSON or Shapefile files. Priority: 80 (protected from scrapes). Files will be intelligently merged with existing data. Large files may take several minutes to process.
            </p>

            <div className="form-group">
              <label>1️⃣ Select Source Type:</label>
              <select 
                value={uploadSourceType} 
                onChange={(e) => setUploadSourceType(e.target.value)}
                disabled={uploadLoading}
              >
                <option value="Public Federal">Public Federal</option>
                <option value="Public State">Public State</option>
                <option value="State Agency">State Agency</option>
                <option value="County Agency">County Agency</option>
                <option value="City Agency">City Agency</option>
              </select>
            </div>

            <div className="form-group">
              <label>2️⃣ Enter State (if not in file):</label>
              <input
                type="text"
                value={uploadState}
                onChange={(e) => setUploadState(e.target.value)}
                placeholder="e.g., Georgia, GA, or leave empty if file contains state"
                disabled={uploadLoading}
                style={{ width: '100%', padding: '8px', marginTop: '5px' }}
              />
              <p style={{ marginTop: '5px', fontSize: '0.9rem', color: '#666' }}>
                <strong>Note:</strong> Many shapefiles don't include state information. Enter the state here if your file doesn't have it.
              </p>
            </div>

            <div className="form-group">
              <label>3️⃣ Select File (GeoJSON, Shapefile, or ZIP):</label>
              <input
                type="file"
                accept=".geojson,.json,.shp,.zip"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setUploadFile(file);
                  setUploadError(null);
                  setUploadResult(null);
                }}
                disabled={uploadLoading}
              />
              {uploadFile && (
                <p style={{ marginTop: '10px', color: '#666' }}>
                  Selected: <strong>{uploadFile.name}</strong> ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                  {uploadFile.size > 50 * 1024 * 1024 && (
                    <span style={{ color: '#ff6b6b', marginLeft: '10px' }}>
                      ⚠️ Large file - processing may take several minutes
                    </span>
                  )}
                </p>
              )}
              <p style={{ marginTop: '10px', fontSize: '0.9rem', color: '#666' }}>
                <strong>Supported formats:</strong> GeoJSON (.geojson, .json), Shapefile (.shp), or ZIP archives containing shapefiles (.zip)
              </p>
            </div>

            <div className="form-group">
              <button
                onClick={handleFileUpload}
                disabled={!uploadFile || uploadLoading}
                className="primary-button"
              >
                {uploadLoading ? '⏳ Uploading...' : '📤 Upload File'}
              </button>
            </div>

            {uploadError && (
              <div className="error-message" style={{ marginTop: '20px' }}>
                <strong>Error:</strong> {uploadError}
              </div>
            )}

            {uploadResult && (
              <div className="success-message" style={{ marginTop: '20px', padding: '20px', background: '#f0f7ed', borderRadius: '8px' }}>
                <h3 style={{ marginTop: 0 }}>✅ Upload Complete!</h3>
                <ul style={{ textAlign: 'left', display: 'inline-block' }}>
                  <li><strong>File:</strong> {uploadResult.sourceName}</li>
                  <li><strong>Source Type:</strong> {uploadResult.sourceType}</li>
                  <li><strong>Parks Found:</strong> {uploadResult.parksFound}</li>
                  <li><strong>Parks Added:</strong> {uploadResult.parksAdded}</li>
                  <li><strong>Parks Updated:</strong> {uploadResult.parksUpdated}</li>
                  <li><strong>Parks Skipped:</strong> {uploadResult.parksSkipped}</li>
                </ul>
                {uploadResult.errors && uploadResult.errors.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <strong>Errors:</strong>
                    <ul style={{ textAlign: 'left' }}>
                      {uploadResult.errors.map((err, idx) => (
                        <li key={idx}>{err.park}: {err.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==================== DATA QUALITY TAB ==================== */}
        {activeTab === 'quality' && (
          <div className="section">
            <h2>🔍 Data Quality & Cleanup</h2>
            <p className="section-description">
              Review data quality metrics, identify issues, and clean up your database
            </p>

            {/* Filters */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
              <div className="form-group">
                <label>Filter by State:</label>
                <select
                  value={qualityFilters.state}
                  onChange={(e) => {
                    setQualityFilters({ ...qualityFilters, state: e.target.value });
                  }}
                  disabled={qualityLoading}
                >
                  <option value="">All States</option>
                  {states.map(state => (
                    <option key={state.id} value={state.name}>{state.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Filter by Agency:</label>
                <input
                  type="text"
                  value={qualityFilters.agency}
                  onChange={(e) => setQualityFilters({ ...qualityFilters, agency: e.target.value })}
                  placeholder="e.g., NPS, BLM"
                  disabled={qualityLoading}
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>

              <div className="form-group">
                <label>Filter by Data Source:</label>
                <input
                  type="text"
                  value={qualityFilters.dataSource}
                  onChange={(e) => setQualityFilters({ ...qualityFilters, dataSource: e.target.value })}
                  placeholder="e.g., PAD-US, ParkServe"
                  disabled={qualityLoading}
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  onClick={loadQualityAnalysis}
                  disabled={qualityLoading}
                  className="primary-button"
                >
                  {qualityLoading ? '⏳ Loading...' : '📊 Analyze'}
                </button>
              </div>
            </div>

            {qualityError && (
              <div className="error-message" style={{ marginBottom: '20px' }}>
                ❌ {qualityError}
              </div>
            )}

            {/* Quality Metrics */}
            {qualityAnalysis && (
              <div style={{ marginBottom: '30px' }}>
                <h3>📊 Quality Metrics</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginTop: '15px' }}>
                  <div style={{ padding: '15px', background: '#f0f7ed', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{qualityAnalysis.total}</div>
                    <div>Total Parks</div>
                  </div>
                  <div style={{ padding: '15px', background: '#e8f4f8', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{qualityAnalysis.averageQualityScore.toFixed(1)}</div>
                    <div>Avg Quality Score</div>
                  </div>
                  <div style={{ padding: '15px', background: '#fff4e6', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{qualityAnalysis.likelyNonParks.length}</div>
                    <div>Likely Non-Parks</div>
                  </div>
                  <div style={{ padding: '15px', background: '#fee', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{qualityAnalysis.issues.length}</div>
                    <div>Parks with Issues</div>
                  </div>
                </div>

                <div style={{ marginTop: '20px', padding: '15px', background: '#f9f9f9', borderRadius: '8px' }}>
                  <h4>Field Completeness</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginTop: '10px' }}>
                    <div>📍 Coordinates: {qualityAnalysis.percentages.withCoordinates}%</div>
                    <div>📝 Description: {qualityAnalysis.percentages.withDescription}%</div>
                    <div>🌐 Website: {qualityAnalysis.percentages.withWebsite}%</div>
                    <div>📞 Phone: {qualityAnalysis.percentages.withPhone}%</div>
                    <div>🏠 Address: {qualityAnalysis.percentages.withAddress}%</div>
                    <div>🗺️ Boundary: {qualityAnalysis.percentages.withGeometry}%</div>
                  </div>
                </div>

                <div style={{ marginTop: '20px', padding: '15px', background: '#f9f9f9', borderRadius: '8px' }}>
                  <h4>Quality Distribution</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '10px' }}>
                    <div>✅ Excellent (80-100): {qualityAnalysis.qualityDistribution.excellent}</div>
                    <div>👍 Good (60-79): {qualityAnalysis.qualityDistribution.good}</div>
                    <div>⚠️ Fair (40-59): {qualityAnalysis.qualityDistribution.fair}</div>
                    <div>❌ Poor (0-39): {qualityAnalysis.qualityDistribution.poor}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Filters */}
            <div style={{ marginTop: '30px', padding: '20px', background: '#e8f4f8', borderRadius: '8px' }}>
              <h3>🔎 Quick Filters</h3>
              <p>Find parks that need attention:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '15px' }}>
                <button
                  onClick={() => loadFilteredParks({ nameKeywords: ['office', 'facility', 'headquarters', 'admin'] })}
                  disabled={qualityLoading}
                  className="primary-button"
                  style={{ fontSize: '0.9rem' }}
                >
                  🏢 Find Offices/Facilities
                </button>
                <button
                  onClick={() => loadFilteredParks({ maxAcres: 0.1 })}
                  disabled={qualityLoading}
                  className="primary-button"
                  style={{ fontSize: '0.9rem' }}
                >
                  📏 Very Small (&lt; 0.1 acres)
                </button>
                <button
                  onClick={() => loadFilteredParks({ missingFields: ['description', 'website', 'phone'] })}
                  disabled={qualityLoading}
                  className="primary-button"
                  style={{ fontSize: '0.9rem' }}
                >
                  📋 Missing Info
                </button>
                <button
                  onClick={() => loadFilteredParks({ missingFields: ['coordinates'] })}
                  disabled={qualityLoading}
                  className="primary-button"
                  style={{ fontSize: '0.9rem' }}
                >
                  📍 Missing Coordinates
                </button>
                <button
                  onClick={() => loadFilteredParks({ missingFields: ['geometry'] })}
                  disabled={qualityLoading}
                  className="primary-button"
                  style={{ fontSize: '0.9rem' }}
                >
                  🗺️ Missing Boundaries
                </button>
                {qualityAnalysis && qualityAnalysis.likelyNonParks.length > 0 && (
                  <button
                    onClick={() => {
                      const nonParkIds = qualityAnalysis.likelyNonParks.map(p => p.id);
                      setFilteredParks(qualityAnalysis.likelyNonParks.map(p => ({
                        id: p.id,
                        name: p.name,
                        state: p.state,
                        agency: p.agency,
                        acres: p.acres,
                        qualityScore: 0
                      })));
                      setSelectedParks(new Set(nonParkIds));
                    }}
                    disabled={qualityLoading}
                    className="primary-button"
                    style={{ fontSize: '0.9rem', background: '#ff6b6b' }}
                  >
                    🚫 Likely Non-Parks ({qualityAnalysis.likelyNonParks.length})
                  </button>
                )}
              </div>
            </div>

            {/* Filtered Parks List */}
            {filteredParks.length > 0 && (
              <div style={{ marginTop: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3>📋 Filtered Parks ({filteredParks.length})</h3>
                  <div>
                    <button
                      onClick={selectAllParks}
                      className="primary-button"
                      style={{ marginRight: '10px', fontSize: '0.9rem' }}
                    >
                      {selectedParks.size === filteredParks.length ? 'Deselect All' : 'Select All'}
                    </button>
                    {selectedParks.size > 0 && (
                      <button
                        onClick={handleDeleteParks}
                        disabled={deleteLoading}
                        className="primary-button"
                        style={{ background: '#ff6b6b', fontSize: '0.9rem' }}
                      >
                        {deleteLoading ? '⏳ Deleting...' : `🗑️ Delete Selected (${selectedParks.size})`}
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ maxHeight: '500px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f5f5f5', position: 'sticky', top: 0 }}>
                      <tr>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                          <input
                            type="checkbox"
                            checked={selectedParks.size === filteredParks.length && filteredParks.length > 0}
                            onChange={selectAllParks}
                          />
                        </th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Name</th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>State</th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Agency</th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Acres</th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Quality</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredParks.map(park => (
                        <tr key={park.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '10px' }}>
                            <input
                              type="checkbox"
                              checked={selectedParks.has(park.id)}
                              onChange={() => toggleParkSelection(park.id)}
                            />
                          </td>
                          <td style={{ padding: '10px' }}>{park.name}</td>
                          <td style={{ padding: '10px' }}>{park.state}</td>
                          <td style={{ padding: '10px' }}>{park.agency}</td>
                          <td style={{ padding: '10px' }}>{park.acres ? park.acres.toFixed(2) : 'N/A'}</td>
                          <td style={{ padding: '10px' }}>
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '0.85rem',
                              background: park.qualityScore >= 80 ? '#d4edda' :
                                         park.qualityScore >= 60 ? '#d1ecf1' :
                                         park.qualityScore >= 40 ? '#fff3cd' : '#f8d7da'
                            }}>
                              {park.qualityScore}/100
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Likely Non-Parks List */}
            {qualityAnalysis && qualityAnalysis.likelyNonParks.length > 0 && filteredParks.length === 0 && (
              <div style={{ marginTop: '30px' }}>
                <h3>🚫 Likely Non-Parks ({qualityAnalysis.likelyNonParks.length})</h3>
                <p style={{ color: '#666', marginBottom: '15px' }}>
                  These parks may be offices, facilities, or other non-park locations
                </p>
                <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f5f5f5', position: 'sticky', top: 0 }}>
                      <tr>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                          <input
                            type="checkbox"
                            checked={selectedParks.size === qualityAnalysis.likelyNonParks.length && qualityAnalysis.likelyNonParks.length > 0}
                            onChange={() => {
                              if (selectedParks.size === qualityAnalysis.likelyNonParks.length) {
                                setSelectedParks(new Set());
                              } else {
                                setSelectedParks(new Set(qualityAnalysis.likelyNonParks.map(p => p.id)));
                              }
                            }}
                          />
                        </th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Name</th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>State</th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Agency</th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Reason</th>
                        <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Acres</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qualityAnalysis.likelyNonParks.map(park => (
                        <tr key={park.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '10px' }}>
                            <input
                              type="checkbox"
                              checked={selectedParks.has(park.id)}
                              onChange={() => toggleParkSelection(park.id)}
                            />
                          </td>
                          <td style={{ padding: '10px' }}>{park.name}</td>
                          <td style={{ padding: '10px' }}>{park.state}</td>
                          <td style={{ padding: '10px' }}>{park.agency}</td>
                          <td style={{ padding: '10px', fontSize: '0.9rem', color: '#666' }}>{park.reason}</td>
                          <td style={{ padding: '10px' }}>{park.acres ? park.acres.toFixed(2) : 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {selectedParks.size > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <button
                      onClick={handleDeleteParks}
                      disabled={deleteLoading}
                      className="primary-button"
                      style={{ background: '#ff6b6b' }}
                    >
                      {deleteLoading ? '⏳ Deleting...' : `🗑️ Delete Selected (${selectedParks.size})`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="admin-footer">
        <h4>🛡️ Data Priority System</h4>
        <div className="priority-info">
          <div className="priority-item">
            <span className="priority-badge priority-100">100</span>
            <span>API Data - Never overwritten</span>
          </div>
          <div className="priority-item">
            <span className="priority-badge priority-80">80</span>
            <span>Agency Files - Protected</span>
          </div>
          <div className="priority-item">
            <span className="priority-badge priority-40">40</span>
            <span>Web Scrapes - Fills gaps</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;
