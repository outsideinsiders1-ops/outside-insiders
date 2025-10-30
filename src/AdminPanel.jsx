import React, { useState } from 'react';

function AdminPanel() {
  const [scrapeType, setScrapeType] = useState('state');
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const API_URL = import.meta.env.VITE_SCRAPER_API_URL;;

  const handleScrape = async () => {
    if (!locationName.trim()) {
      setError('Please enter a location name');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/scrape`, {
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
      
      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error || 'Scraping failed');
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Admin Panel - Park Scraper</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '10px' }}>
          <strong>Scrape Type:</strong>
        </label>
        <select 
          value={scrapeType} 
          onChange={(e) => setScrapeType(e.target.value)}
          style={{ width: '100%', padding: '8px', fontSize: '16px' }}
        >
          <option value="state">State Parks</option>
          <option value="county">County Parks (Coming Soon)</option>
          <option value="city">City Parks (Coming Soon)</option>
        </select>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '10px' }}>
          <strong>Location Name:</strong>
        </label>
        <input
          type="text"
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          placeholder="e.g., California"
          style={{ width: '100%', padding: '8px', fontSize: '16px' }}
        />
      </div>

      <button
        onClick={handleScrape}
        disabled={loading}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          backgroundColor: loading ? '#ccc' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Scraping...' : 'Start Scrape'}
      </button>

      {error && (
        <div style={{ 
          marginTop: '20px', 
          padding: '10px', 
          backgroundColor: '#f8d7da', 
          color: '#721c24',
          borderRadius: '4px'
        }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ 
          marginTop: '20px', 
          padding: '10px', 
          backgroundColor: '#d4edda', 
          color: '#155724',
          borderRadius: '4px'
        }}>
          <strong>Success!</strong> {result.message}
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
