'use client'

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import './AdminPanel.css';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  // ==================== LOAD GEOGRAPHIC DATA ====================
  useEffect(() => {
    loadStates();
  }, []);

  // Load all states
  const loadStates = async () => {
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

    setUploadLoading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('sourceType', uploadSourceType);
      formData.append('sourceName', uploadFile.name);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

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
      } else {
        setUploadError(data.error || 'Upload failed')
      }
    } catch (err) {
      console.error('Upload error:', err)
      setUploadError(`Network error: ${err.message}. Please check your connection and try again.`)
    } finally {
      setUploadLoading(false)
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

            <div className="empty-state">
              <p>API integration coming soon!</p>
              <ul style={{ textAlign: 'left', display: 'inline-block', marginTop: '10px' }}>
                <li>NPS API (Priority: 100)</li>
                <li>Recreation.gov API (Priority: 95)</li>
                <li>State Park APIs (Priority: 90)</li>
              </ul>
            </div>
          </div>
        )}

        {/* ==================== FILE UPLOAD TAB ==================== */}
        {activeTab === 'upload' && (
          <div className="section">
            <h2>File Upload</h2>
            <p className="section-description">
              Upload GeoJSON files. Priority: 80 (protected from scrapes). Files will be intelligently merged with existing data.
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
              <label>2️⃣ Select GeoJSON File:</label>
              <input
                type="file"
                accept=".geojson,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setUploadFile(file);
                  setUploadError(null);
                  setUploadResult(null);
                  
                  // Check if it's a shapefile
                  if (file && (file.name.toLowerCase().endsWith('.shp') || file.name.toLowerCase().endsWith('.zip'))) {
                    setUploadError('Shapefile support coming soon. Please convert to GeoJSON first using tools like QGIS, ArcGIS, or mapshaper.org');
                  }
                }}
                disabled={uploadLoading}
              />
              {uploadFile && (
                <p style={{ marginTop: '10px', color: '#666' }}>
                  Selected: <strong>{uploadFile.name}</strong> ({(uploadFile.size / 1024).toFixed(2)} KB)
                </p>
              )}
              <p style={{ marginTop: '10px', fontSize: '0.9rem', color: '#666' }}>
                <strong>Note:</strong> Currently supports GeoJSON files only. For Shapefiles, please convert to GeoJSON first.
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
