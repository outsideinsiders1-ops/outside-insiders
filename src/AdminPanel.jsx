import React, { useState, useEffect } from 'react';
import './AdminPanel.css';

function AdminPanel() {
  // State for active tab
  const [activeTab, setActiveTab] = useState('scraper'); // v2
  // Web Scraper state
  const [states, setStates] = useState([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [selectedState, setSelectedState] = useState('');
  const [entityType, setEntityType] = useState('county');
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeResult, setScrapeResult] = useState(null);
  const [scrapeError, setScrapeError] = useState(null);

  // API Integrator state
  const [apiSources, setApiSources] = useState([]);
  const [loadingApiSources, setLoadingApiSources] = useState(true);
  const [showAddApi, setShowAddApi] = useState(false);
  const [newApiName, setNewApiName] = useState('');
  const [newApiType, setNewApiType] = useState('recreation_gov');
  const [newApiUrl, setNewApiUrl] = useState('https://ridb.recreation.gov/api/v1');
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

  const API_URL = import.meta.env.VITE_SCRAPER_API_URL;

  // Load API sources on mount
  useEffect(() => {
    if (activeTab === 'api') {
      loadApiSources();
    }
    if (activeTab === 'scraper') {
      loadStates();
    }
  }, [activeTab]);

  // ==================== LOAD STATES ====================
  const loadStates = async () => {
    setLoadingStates(true);
    try {
      const response = await fetch(`${API_URL}/api/geo/states`);
      const data = await response.json();
      
      if (response.ok && data.success) {
        setStates(data.states || []);
      }
    } catch (err) {
      console.error('Error loading states:', err);
    } finally {
      setLoadingStates(false);
    }
  };

  // ==================== API SOURCE MANAGEMENT ====================
  const loadApiSources = async () => {
    setLoadingApiSources(true);
    try {
      const response = await fetch(`${API_URL}/api/sources`);
      const data = await response.json();
      
      if (response.ok) {
        setApiSources(data.sources || []);
      }
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

    try {
      const response = await fetch(`${API_URL}/api/sources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newApiName,
          api_type: newApiType,
          base_url: newApiUrl,
          api_key: newApiKey || null,
          enabled: true
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setApiSuccess('API source added successfully!');
        setNewApiName('');
        setNewApiType('recreation_gov');
        setNewApiUrl('');
        setNewApiKey('');
        setShowAddApi(false);
        loadApiSources();
        
        setTimeout(() => setApiSuccess(null), 3000);
      } else {
        setApiError(data.error || 'Failed to add API source');
      }
    } catch (err) {
      setApiError(`Error: ${err.message}`);
    }
  };

  const handleToggleApiSource = async (id, currentStatus) => {
    try {
      const response = await fetch(`${API_URL}/api/sources/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: !currentStatus
        }),
      });

      if (response.ok) {
        loadApiSources();
      }
    } catch (err) {
      console.error('Error toggling API source:', err);
    }
  };

  const handleDeleteApiSource = async (id) => {
    if (!window.confirm('Are you sure you want to delete this API source?')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/sources/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setApiSuccess('API source deleted');
        loadApiSources();
        setTimeout(() => setApiSuccess(null), 3000);
      }
    } catch (err) {
      setApiError(`Error: ${err.message}`);
    }
  };

  const handleSyncOne = async (id, name) => {
    setSyncingId(id);
    setApiError(null);
    setApiSuccess(null);

    try {
      const response = await fetch(`${API_URL}/api/sources/${id}/sync`, {
        method: 'POST',
      });

      const data = await response.json();
      
      if (response.ok) {
        setApiSuccess(`âœ… ${name} synced successfully!`);
        loadApiSources();
      } else {
        setApiError(data.error || `Failed to sync ${name}`);
      }
    } catch (err) {
      setApiError(`Error syncing ${name}: ${err.message}`);
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    const activeApis = apiSources.filter(api => api.enabled);
    
    if (activeApis.length === 0) {
      setApiError('No active API sources to sync');
      return;
    }

    setSyncingAll(true);
    setApiError(null);
    setApiSuccess(null);

    try {
      const response = await fetch(`${API_URL}/api/sources/sync-all`, {
        method: 'POST',
      });

      const data = await response.json();
      
      if (response.ok) {
        setApiSuccess(`âœ… Synced ${data.syncedCount} API sources successfully!`);
        loadApiSources();
      } else {
        setApiError(data.error || 'Failed to sync APIs');
      }
    } catch (err) {
      setApiError(`Error: ${err.message}`);
    } finally {
      setSyncingAll(false);
    }
  };

  // ==================== WEB SCRAPER ====================
  const handleScrape = async () => {
    if (!selectedState) {
      setScrapeError('Please select a state');
      return;
    }

    setScrapeLoading(true);
    setScrapeError(null);
    setScrapeResult(null);

    try {
      const response = await fetch(`${API_URL}/api/scrape/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state_code: selectedState,
          entity_type: entityType
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setScrapeResult(data);
      } else {
        setScrapeError(data.error || 'Bulk scraping failed');
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

    setUploadLoading(true);
    setUploadError(null);
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('source', fileSource);
    formData.append('state', fileState);

    try {
      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (response.ok) {
        setUploadResult(data);
        setSelectedFile(null);
        document.getElementById('file-input').value = '';
      } else {
        setUploadError(data.error || 'File upload failed');
      }
    } catch (err) {
      setUploadError(`Error: ${err.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  // ==================== RENDER ====================
  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>ðŸžï¸ Outside Insiders Admin Panel</h1>
        <p>Manage park data sources</p>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          className={`tab ${activeTab === 'scraper' ? 'active' : ''}`}
          onClick={() => setActiveTab('scraper')}
        >
          ðŸŒ Web Scraper
        </button>
        <button
          className={`tab ${activeTab === 'api' ? 'active' : ''}`}
          onClick={() => setActiveTab('api')}
        >
          ðŸ”Œ API Manager
        </button>
        <button
          className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          ðŸ“ File Upload
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        
        {/* ==================== WEB SCRAPER TAB ==================== */}
        {activeTab === 'scraper' && (
          <div className="section">
            <h2>Bulk Web Scraper</h2>
            <p className="section-description">
              Select a state and jurisdiction type to scrape all matching entities. Priority: 40 (can't overwrite API or file data)
            </p>

            <div className="form-group">
              <label>Select State:</label>
              {loadingStates ? (
                <p>Loading states...</p>
              ) : (
                <select 
                  value={selectedState} 
                  onChange={(e) => setSelectedState(e.target.value)}
                  disabled={scrapeLoading}
                >
                  <option value="">-- Choose a State --</option>
                  {states.map(state => (
                    <option key={state.state_code} value={state.state_code}>
                      {state.name} ({state.state_code})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="form-group">
              <label>Jurisdiction Type:</label>
              <select 
                value={entityType} 
                onChange={(e) => setEntityType(e.target.value)}
                disabled={scrapeLoading}
              >
                <option value="state">State Parks</option>
                <option value="county">County Parks</option>
                <option value="city">City Parks</option>
              </select>
            </div>

            <button
              onClick={handleScrape}
              disabled={scrapeLoading || !selectedState}
              className="primary-button"
            >
              {scrapeLoading ? '🔄 Scraping...' : '🚀 Scrape All'}
            </button>

            {scrapeError && (
              <div className="alert alert-error">
                ❌ {scrapeError}
              </div>
            )}

            {scrapeResult && (
              <div className="alert alert-success">
                ✅ {scrapeResult.message}
                {scrapeResult.entity_count && (
                  <div className="result-details">
                    <p><strong>Entities queued:</strong> {scrapeResult.entity_count}</p>
                    {scrapeResult.entities && scrapeResult.entities.length > 0 && (
                      <p><strong>Examples:</strong> {scrapeResult.entities.slice(0, 5).join(', ')}
                      {scrapeResult.entities.length > 5 && '...'}</p>
                    )}
                    <p style={{marginTop: '12px', fontSize: '14px', color: '#666'}}>
                      ℹ️ Scraping runs in the background. Check your Replit server logs to monitor progress.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
                {showAddApi ? 'âœ• Cancel' : 'âž• Add API'}
              </button>
            </div>

            {/* Add API Form */}
            {showAddApi && (
              <div className="add-api-form">
                <h3>Add New API Source</h3>
                
                <div className="form-group">
                  <label>API Type:</label>
                  <select
                    value={newApiType}
                    onChange={(e) => {
                      setNewApiType(e.target.value);
                      // Auto-fill URL based on selection
                      if (e.target.value === 'nps') {
                        setNewApiUrl('https://developer.nps.gov/api/v1');
                      } else if (e.target.value === 'recreation_gov') {
                        setNewApiUrl('https://ridb.recreation.gov/api/v1');
                      } else {
                        setNewApiUrl('');
                      }
                    }}
                  >
                    <option value="recreation_gov">Recreation.gov API</option>
                    <option value="nps">NPS API</option>
                    <option value="generic">Generic REST API</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>API Name:</label>
                  <input
                    type="text"
                    value={newApiName}
                    onChange={(e) => setNewApiName(e.target.value)}
                    placeholder="e.g., Recreation.gov API, California State Parks API"
                  />
                </div>
                <div className="form-group">
                  <label>Base URL:</label>
                  <input
                    type="text"
                    value={newApiUrl}
                    onChange={(e) => setNewApiUrl(e.target.value)}
                    placeholder="e.g., https://developer.nps.gov/api/v1"
                  />
                </div>
                <div className="form-group">
                  <label>API Key (optional):</label>
                  <input
                    type="password"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    placeholder="Leave blank if not required"
                  />
                </div>
                <button onClick={handleAddApiSource} className="primary-button">
                  âœ… Add API Source
                </button>
              </div>
            )}

            {/* Alerts */}
            {apiError && (
              <div className="alert alert-error">
                âŒ {apiError}
              </div>
            )}

            {apiSuccess && (
              <div className="alert alert-success">
                {apiSuccess}
              </div>
            )}

            {/* Sync All Button */}
            {apiSources.filter(api => api.enabled).length > 0 && (
              <div className="sync-all-section">
                <button
                  onClick={handleSyncAll}
                  disabled={syncingAll}
                  className="sync-all-button"
                >
                  {syncingAll ? 'ðŸ”„ Syncing All APIs...' : 'âš¡ Auto-Sync All Active APIs'}
                </button>
                <p className="sync-note">
                  This will sync all enabled API sources in sequence
                </p>
              </div>
            )}

            {/* API Sources List */}
            <div className="api-sources-list">
              {loadingApiSources ? (
                <div className="loading">Loading API sources...</div>
              ) : apiSources.length === 0 ? (
                <div className="empty-state">
                  <p>No API sources configured yet.</p>
                  <p>Click "Add API" to get started!</p>
                </div>
              ) : (
                apiSources.map((api) => (
                  <div key={api.id} className={`api-source-card ${!api.enabled ? 'disabled' : ''}`}>
                    <div className="api-source-header">
                      <div className="api-source-info">
                        <h3>{api.name}</h3>
                        <p className="api-url">{api.base_url}</p>
                        {api.api_key && <span className="api-key-badge">ðŸ”‘ API Key Set</span>}
                      </div>
                      <div className="api-source-actions">
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={api.enabled}
                            onChange={() => handleToggleApiSource(api.id, api.enabled)}
                          />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                    </div>

                    {api.last_sync && (
                      <div className="api-last-sync">
                        Last synced: {new Date(api.last_sync).toLocaleString()}
                      </div>
                    )}

                    <div className="api-source-footer">
                      <button
                        onClick={() => handleSyncOne(api.id, api.name)}
                        disabled={!api.enabled || syncingId === api.id || syncingAll}
                        className="sync-button"
                      >
                        {syncingId === api.id ? 'ðŸ”„ Syncing...' : 'ðŸ”„ Sync Now'}
                      </button>
                      <button
                        onClick={() => handleDeleteApiSource(api.id)}
                        className="delete-button"
                      >
                        ðŸ—‘ï¸ Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* API Examples */}
            <div className="api-examples">
              <h4>ðŸ’¡ Example APIs:</h4>
              <ul>
                <li><strong>NPS:</strong> https://developer.nps.gov/api/v1</li>
                <li><strong>Recreation.gov:</strong> https://ridb.recreation.gov/api/v1</li>
                <li><strong>California State Parks:</strong> https://www.parks.ca.gov/api</li>
              </ul>
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

            <div className="form-group">
              <label>File Type:</label>
              <select 
                value={fileSource} 
                onChange={(e) => setFileSource(e.target.value)}
                disabled={uploadLoading}
              >
                <option value="state_agency">State Agency File</option>
                <option value="county_gis">County GIS File</option>
                <option value="nps_geojson">NPS GeoJSON</option>
                <option value="usgs_shapefile">USGS Shapefile</option>
              </select>
            </div>

            <div className="form-group">
              <label>State:</label>
              <input
                type="text"
                value={fileState}
                onChange={(e) => setFileState(e.target.value)}
                placeholder="e.g., North Carolina"
                disabled={uploadLoading}
              />
            </div>

            <div className="form-group">
              <label>Select File:</label>
              <input
                id="file-input"
                type="file"
                accept=".geojson,.json,.shp,.zip"
                onChange={handleFileChange}
                disabled={uploadLoading}
              />
              {selectedFile && (
                <div className="file-info">
                  ðŸ“„ {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </div>
              )}
            </div>

            <div className="file-info-box">
              <h4>ðŸ“‹ Supported File Types:</h4>
              <ul>
                <li><strong>GeoJSON:</strong> .geojson or .json files</li>
                <li><strong>Shapefile:</strong> .shp files or .zip containing .shp, .shx, .dbf</li>
              </ul>
              <p className="note">ðŸ’¡ Max file size: 50 MB</p>
            </div>

            <button
              onClick={handleFileUpload}
              disabled={uploadLoading || !selectedFile}
              className="primary-button"
            >
              {uploadLoading ? 'ðŸ”„ Uploading...' : 'ðŸ“¤ Upload File'}
            </button>

            {uploadError && (
              <div className="alert alert-error">
                âŒ {uploadError}
              </div>
            )}

            {uploadResult && (
              <div className="alert alert-success">
                âœ… {uploadResult.message}
                {uploadResult.featuresProcessed && (
                  <div className="result-details">
                    <p>Features processed: {uploadResult.featuresProcessed}</p>
                    <p>Parks added: {uploadResult.parksAdded}</p>
                    <p>Parks updated: {uploadResult.parksUpdated}</p>
                    <p>Parks skipped: {uploadResult.parksSkipped}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="admin-footer">
        <h4>ðŸ›¡ï¸ Data Priority System</h4>
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

