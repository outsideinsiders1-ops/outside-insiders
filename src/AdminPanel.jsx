import React, { useState, useEffect } from 'react';
import './AdminPanel.css';

function AdminPanel() {
  // State for active tab
  const [activeTab, setActiveTab] = useState('scraper');

  // Web Scraper state
  const [scrapeType, setScrapeType] = useState('state');
  const [locationName, setLocationName] = useState('');
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeResult, setScrapeResult] = useState(null);
  const [scrapeError, setScrapeError] = useState(null);

  // API Integrator state
  const [apiSources, setApiSources] = useState([]);
  const [loadingApiSources, setLoadingApiSources] = useState(true);
  const [showAddApi, setShowAddApi] = useState(false);
  const [newApiName, setNewApiName] = useState('');
  const [newApiType, setNewApiType] = useState('recreation_gov');
  const [newApiUrl, setNewApiUrl] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [apiSuccess, setApiSuccess] = useState(null);

  // File Upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileSource, setFileSource] = useState('state_agency');
  const [fileState, setFileState] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  // UPDATED: No external API URL needed anymore!
  // We'll use relative URLs since the API is in the same project

  // Load API sources on mount
  useEffect(() => {
    if (activeTab === 'api') {
      loadApiSources();
    }
  }, [activeTab]);

  // ==================== API SOURCE MANAGEMENT ====================
  const loadApiSources = async () => {
    setLoadingApiSources(true);
    try {
      // For now, use mock data since this endpoint isn't set up yet
      setApiSources([]);
    } catch (err) {
      console.error('Error loading API sources:', err);
    } finally {
      setLoadingApiSources(false);
    }
  };

  const handleAddApiSource = async () => {
    if (!newApiName.trim() || !newApiUrl.trim()) {
      setApiError('Please provide API name and URL');
      return;
    }

    // This will be implemented later
    setApiError('API source management coming soon!');
  };

  const handleToggleApiSource = async (id, currentStatus) => {
    // This will be implemented later
    console.log('Toggle API source:', id);
  };

  const handleDeleteApiSource = async (id) => {
    // This will be implemented later
    console.log('Delete API source:', id);
  };

  const handleSyncOne = async (id, name) => {
    // This will be implemented later
    setApiError('API syncing coming soon!');
  };

  const handleSyncAll = async () => {
    // This will be implemented later
    setApiError('Bulk API syncing coming soon!');
  };

  // ==================== WEB SCRAPER ====================
  const handleScrape = async () => {
    if (!locationName.trim()) {
      setScrapeError('Please enter a location name');
      return;
    }

    setScrapeLoading(true);
    setScrapeError(null);
    setScrapeResult(null);

    try {
      // UPDATED: Use relative URL for same-domain API
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: scrapeType,
          name: locationName
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setScrapeResult(data);
        // Clear the input for next scrape
        setLocationName('');
      } else {
        setScrapeError(data.error || 'Scraping failed');
      }
    } catch (err) {
      setScrapeError(`Error: ${err.message}`);
    } finally {
      setScrapeLoading(false);
    }
  };

  // ==================== FILE UPLOAD ====================
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const validTypes = ['.geojson', '.json', '.shp', '.zip'];
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      
      if (!validTypes.includes(fileExtension)) {
        setUploadError('Please upload a GeoJSON (.geojson, .json) or Shapefile (.shp, .zip) file');
        setSelectedFile(null);
        return;
      }
      
      setSelectedFile(file);
      setUploadError(null);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      setUploadError('Please select a file');
      return;
    }

    if (!fileState.trim()) {
      setUploadError('Please enter a state');
      return;
    }

    // This will be implemented later
    setUploadError('File upload coming soon!');
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

            <div className="form-group">
              <label>Scrape Type:</label>
              <select 
                value={scrapeType} 
                onChange={(e) => setScrapeType(e.target.value)}
                disabled={scrapeLoading}
              >
                <option value="state">State Parks</option>
                <option value="county">County Parks</option>
                <option value="city">City Parks</option>
              </select>
            </div>

            <div className="form-group">
              <label>Location Name:</label>
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g., North Carolina, Georgia, Tennessee"
                disabled={scrapeLoading}
              />
              <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                Try: North Carolina, South Carolina, Georgia, Tennessee, Virginia
              </small>
            </div>

            <button
              onClick={handleScrape}
              disabled={scrapeLoading}
              className="primary-button"
            >
              {scrapeLoading ? '🔄 Scraping...' : '🚀 Start Scrape'}
            </button>

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

            <div style={{ marginTop: '30px', padding: '20px', background: '#f0f7ed', borderRadius: '8px' }}>
              <h4>🎯 How Quality Scoring Works:</h4>
              <ul style={{ lineHeight: '1.8' }}>
                <li><strong>Quality Score:</strong> Each park gets 0-100 points based on data completeness</li>
                <li><strong>Priority Level:</strong> API data (90+) beats web scrapes (40)</li>
                <li><strong>Protection:</strong> Good data never gets overwritten by bad data</li>
                <li><strong>Smart Updates:</strong> Only updates if quality improves</li>
              </ul>
            </div>
          </div>
        )}

        {/* ==================== API MANAGER TAB ==================== */}
        {activeTab === 'api' && (
          <div className="section">
            <div className="section-header">
              <div>
                <h2>API Manager</h2>
                <p className="section-description">
                  Manage and sync official government APIs. Priority: 100 (highest - protects this data)
                </p>
              </div>
              <button
                onClick={() => setShowAddApi(!showAddApi)}
                className="secondary-button"
              >
                {showAddApi ? '✕ Cancel' : '➕ Add API'}
              </button>
            </div>

            {apiError && (
              <div className="alert alert-error">
                ⚠️ {apiError}
              </div>
            )}

            {apiSuccess && (
              <div className="alert alert-success">
                {apiSuccess}
              </div>
            )}

            <div className="empty-state">
              <p>API integration coming soon!</p>
              <p>This will connect to NPS, Recreation.gov, and state park APIs.</p>
            </div>
          </div>
        )}

        {/* ==================== FILE UPLOAD TAB ==================== */}
        {activeTab === 'upload' && (
          <div className="section">
            <h2>File Upload</h2>
            <p className="section-description">
              Upload GeoJSON or Shapefile data from agencies. Priority: 80 (can overwrite scrapes but not APIs)
            </p>

            {uploadError && (
              <div className="alert alert-error">
                ⚠️ {uploadError}
              </div>
            )}

            <div className="empty-state">
              <p>File upload coming soon!</p>
              <p>This will allow uploading GeoJSON and Shapefiles from government agencies.</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="admin-footer">
        <h4>🛡️ Data Priority System</h4>
        <div className="priority-info">
          <div className="priority-item">
            <span className="priority-badge priority-100">100</span>
            <span>API Data - Never overwritten</span>
          </div>
          <div className="priority-item">
            <span className="priority-badge priority-80">80</span>
            <span>Agency Files - Protected from scrapes</span>
          </div>
          <div className="priority-item">
            <span className="priority-badge priority-40">40</span>
            <span>Web Scrapes - Fills gaps only</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;
