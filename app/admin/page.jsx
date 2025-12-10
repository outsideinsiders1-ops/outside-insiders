'use client'

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/utils/supabase';
import { calculateDataQualityScore, calculateQualityBreakdownMatrix, analyzeParksQuality } from '../../lib/utils/data-quality.js';
import './AdminPanel.css';

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
  const [syncSourceType, setSyncSourceType] = useState('NPS');
  const [syncApiKey, setSyncApiKey] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [savedApiConfigs, setSavedApiConfigs] = useState([]); // Array of { sourceType, apiKey, lastUsed }
  
  // Recreation.gov Enrichment state
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichResult, setEnrichResult] = useState(null);
  const [enrichError, setEnrichError] = useState(null);
  const [enrichBatchSize, setEnrichBatchSize] = useState(50);

  // Data Quality state
  
  // Geocode Missing Coordinates state
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeResult, setGeocodeResult] = useState(null)
  const [geocodeError, setGeocodeError] = useState(null)
  const [geocodeLimit, setGeocodeLimit] = useState(50)
  const [geocodeState, setGeocodeState] = useState('')
  const [geocodeUseGeometry, setGeocodeUseGeometry] = useState(true)
  const [geocodeType, setGeocodeType] = useState('coordinates') // 'coordinates' or 'state'
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityAnalysis, setQualityAnalysis] = useState(null);
  const [qualityError, setQualityError] = useState(null);
  const [qualityFilters, setQualityFilters] = useState({
    state: '',
    agency: '',
    dataSource: ''
  });
  const [agencyOptions, setAgencyOptions] = useState([]);
  const [dataSourceOptions, setDataSourceOptions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [allParks, setAllParks] = useState([]); // Store all parks for client-side search
  const [filteredParks, setFilteredParks] = useState([]);
  const [selectedParks, setSelectedParks] = useState(new Set());
  const [deleteLoading, setDeleteLoading] = useState(false);
  // Inline editing state
  const [editedParks, setEditedParks] = useState(new Map()); // Map of parkId -> { field: value }
  const [editingCell, setEditingCell] = useState(null); // { parkId, field }
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // { type: 'success'|'error', message }
  // Quality breakdown state
  const [breakdownGroupBy, setBreakdownGroupBy] = useState('agency');
  const [qualityBreakdown, setQualityBreakdown] = useState(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  // ==================== LOAD GEOGRAPHIC DATA ====================
  useEffect(() => {
    loadStates();
    loadAgencyOptions();
    loadDataSourceOptions();
    loadSavedApiConfigs();
  }, []);

  // Load saved API configurations from localStorage
  const loadSavedApiConfigs = () => {
    try {
      const saved = localStorage.getItem('apiConfigs');
      if (saved) {
        const configs = JSON.parse(saved);
        setSavedApiConfigs(configs);
        // Auto-load the most recently used config
        if (configs.length > 0) {
          const mostRecent = configs.sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed))[0];
          setSyncSourceType(mostRecent.sourceType);
          setSyncApiKey(mostRecent.apiKey);
        }
      }
    } catch (error) {
      console.error('Error loading saved API configs:', error);
    }
  };

  // Save API configuration to localStorage
  const saveApiConfig = (sourceType, apiKey) => {
    try {
      const configs = savedApiConfigs.filter(c => c.sourceType !== sourceType);
      const newConfig = {
        sourceType,
        apiKey,
        lastUsed: new Date().toISOString()
      };
      const updated = [...configs, newConfig];
      localStorage.setItem('apiConfigs', JSON.stringify(updated));
      setSavedApiConfigs(updated);
    } catch (error) {
      console.error('Error saving API config:', error);
    }
  };

  // Load a saved API configuration
  const loadApiConfig = (config) => {
    setSyncSourceType(config.sourceType);
    setSyncApiKey(config.apiKey);
  };

  // Delete a saved API configuration
  const deleteApiConfig = (sourceType) => {
    try {
      const updated = savedApiConfigs.filter(c => c.sourceType !== sourceType);
      localStorage.setItem('apiConfigs', JSON.stringify(updated));
      setSavedApiConfigs(updated);
    } catch (error) {
      console.error('Error deleting API config:', error);
    }
  };

  // Load all parks when Data Quality tab is active (Excel-like experience)
  useEffect(() => {
    if (activeTab === 'data-quality' && allParks.length === 0 && !qualityLoading) {
      loadAllParks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, allParks.length, qualityLoading]);

  // Load agency options for dropdown
  const loadAgencyOptions = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('parks')
        .select('agency')
        .not('agency', 'is', null);
      
      if (error) throw error;
      
      // Get unique agencies
      const uniqueAgencies = [...new Set(data.map(p => p.agency).filter(Boolean))].sort();
      setAgencyOptions(uniqueAgencies);
    } catch (error) {
      console.error('Error loading agencies:', error);
    }
  };

  // Load data source options for dropdown
  const loadDataSourceOptions = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('parks')
        .select('data_source')
        .not('data_source', 'is', null);
      
      if (error) throw error;
      
      // Get unique data sources
      const uniqueSources = [...new Set(data.map(p => p.data_source).filter(Boolean))].sort();
      setDataSourceOptions(uniqueSources);
    } catch (error) {
      console.error('Error loading data sources:', error);
    }
  };

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
    const fileSizeMB = uploadFile.size / 1024 / 1024;
    const useChunkedUpload = fileSizeMB > 200; // Use chunked upload for files > 200MB

    try {
      // Step 1: Upload file to Supabase Storage (chunked if large)
      const fileName = `${Date.now()}-${uploadFile.name}`;
      filePath = `uploads/${fileName}`;
      
      if (useChunkedUpload) {
        console.log(`Uploading ${fileSizeMB.toFixed(2)} MB file in chunks to Supabase Storage...`);
        
        // Import and use chunked upload utility
        // For client-side, use relative path from app/admin
        const chunkedUploadModule = await import('../../lib/utils/chunked-upload.js');
        const { uploadFileInChunks } = chunkedUploadModule;
        
        const result = await uploadFileInChunks(
          supabase,
          uploadFile,
          'park-uploads',
          filePath,
          {
            chunkSize: 20 * 1024 * 1024, // 20MB chunks
            onProgress: (progress) => {
              console.log(`Upload progress: ${progress.percentage}% (${progress.chunkNumber}/${progress.totalChunks} chunks, ${(progress.bytesUploaded / 1024 / 1024).toFixed(2)} MB)`);
            }
          }
        );

        if (!result.success) {
          throw new Error(result.error || 'Chunked upload failed');
        }
      } else {
        console.log(`Uploading ${fileSizeMB.toFixed(2)} MB to Supabase Storage...`);
        
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

  // ==================== RECREATION.GOV ENRICHMENT HANDLER ====================
  const handleRecreationGovEnrichment = async () => {
    // Use the same API key from sync if available, or try to get from saved configs
    let apiKey = syncSourceType === 'Recreation.gov' && syncApiKey.trim() 
      ? syncApiKey.trim() 
      : null;

    // If no API key in sync field, try to get from saved configs
    if (!apiKey) {
      const recGovConfig = savedApiConfigs.find(c => c.sourceType === 'Recreation.gov');
      if (recGovConfig) {
        apiKey = recGovConfig.apiKey;
      }
    }

    if (!apiKey) {
      setEnrichError('API key is required. Please enter your Recreation.gov API key in the sync section above, or load a saved configuration.');
      return;
    }

    setEnrichLoading(true);
    setEnrichError(null);
    setEnrichResult(null);

    try {
      const response = await fetch('/api/sync/recreation-gov-enrich', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: apiKey,
          batchSize: parseInt(enrichBatchSize) || 50,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Enrichment failed');
      }

      setEnrichResult(data);
    } catch (err) {
      console.error('Enrichment error:', err);
      setEnrichError(err.message || 'Failed to start enrichment process');
    } finally {
      setEnrichLoading(false);
    }
  };

  // ==================== GEOCODE HANDLER ====================
  const handleGeocode = async () => {
    setGeocodeLoading(true)
    setGeocodeResult(null)
    setGeocodeError(null)

    try {
      const response = await fetch('/api/admin/geocode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          limit: geocodeLimit,
          state: geocodeState || null,
          useGeometry: geocodeUseGeometry,
          geocodeType: geocodeType,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Geocoding failed')
      }

      setGeocodeResult(data)
    } catch (err) {
      console.error('Geocoding error:', err)
      setGeocodeError(err.message || 'Failed to geocode parks')
    } finally {
      setGeocodeLoading(false)
    }
  }

  // ==================== API SYNC HANDLER ====================
  const handleApiSync = async () => {
    if (!syncSourceType) {
      setSyncError('Please select a source type');
      return;
    }

    // For NPS and Recreation.gov, API key is required
    if ((syncSourceType === 'NPS' || syncSourceType === 'Recreation.gov') && !syncApiKey.trim()) {
      setSyncError('API key is required for this source type');
      return;
    }

    setSyncLoading(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      console.log('Starting API sync:', { sourceType: syncSourceType, hasApiKey: !!syncApiKey.trim() });
      
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceType: syncSourceType,
          apiKey: syncApiKey.trim() || undefined,
        }),
      });

      console.log('API sync response status:', response.status);

      const data = await response.json();
      console.log('API sync response data:', JSON.stringify(data, null, 2));

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

      // Check if this is actually the scrape route response (wrong route)
      if (data.route === 'SCRAPE_ROUTE' || (data.message && data.message.includes('TEST: Scraping'))) {
        setSyncError('ERROR: Request was routed to /api/scrape instead of /api/sync. This is a Next.js routing issue.\n\nTROUBLESHOOTING:\n1. Check Vercel logs - you should see 🔴 (red) circles, not 🔵 (blue)\n2. In Vercel dashboard, go to Settings > Functions and clear build cache\n3. Force a new deployment by making a small change and redeploying\n4. Check if there are any Vercel rewrites or redirects configured\n\nIf this persists, it may be a Next.js App Router bug. Consider temporarily renaming /api/scrape to /api/scrape-old to test.');
        setSyncResult(null);
        return;
      }
      
      // Verify we got the sync route response
      if (data.route !== 'SYNC_ROUTE' && !data.route) {
        console.warn('WARNING: Response does not have route identifier. This might indicate a routing issue.');
      }

      // Only show success if response.ok AND data.success is true
      if (data.success === true) {
        // Handle both old format (results object) and new format (direct properties)
        const result = data.results || data;
        const syncResultData = {
          success: true,
          message: data.message || 'Sync complete',
          parksFound: result.parksFound || 0,
          parksAdded: result.parksAdded || 0,
          parksUpdated: result.parksUpdated || 0,
          parksSkipped: result.parksSkipped || 0,
          errors: data.errors
        };
        console.log('API Sync result (parsed):', syncResultData);
        console.log('Parks Found:', syncResultData.parksFound);
        console.log('Parks Added:', syncResultData.parksAdded);
        console.log('Parks Updated:', syncResultData.parksUpdated);
        
        setSyncResult(syncResultData);
        setSyncError(null);
        
        // Save API configuration to localStorage for future use
        if (syncApiKey.trim()) {
          saveApiConfig(syncSourceType, syncApiKey);
        }
        
        // If 0 parks found, show as warning
        if (syncResultData.parksFound === 0) {
          setSyncError('No parks were found by the API. This could indicate:\n- Invalid API key\n- API rate limiting\n- Network issue\n\nCheck the console for detailed logs.');
        }
      } else {
        // Even if response.ok, if success is false, show as error
        console.error('API Sync failed:', data);
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
    if (!supabase) {
      setQualityError('Supabase client not initialized');
      return;
    }

    setQualityLoading(true);
    setQualityError(null);

    try {
      // Direct Supabase query for analysis
      let query = supabase
        .from('parks')
        .select('*');

      if (qualityFilters.state) {
        query = query.eq('state', qualityFilters.state);
      }
      if (qualityFilters.agency) {
        query = query.eq('agency', qualityFilters.agency);
      }
      if (qualityFilters.dataSource) {
        query = query.eq('data_source', qualityFilters.dataSource);
      }

      const { data: parks, error } = await query;

      if (error) {
        throw new Error(error.message || 'Failed to load parks');
      }

      if (parks) {
        // Calculate quality analysis client-side
        const analysis = analyzeParksQuality(parks);
        setQualityAnalysis(analysis);
        // Also load all parks for search
        await loadAllParks();
      }
    } catch (err) {
      console.error('Quality analysis error:', err);
      setQualityError(`Error: ${err.message}`);
    } finally {
      setQualityLoading(false);
    }
  };

  const loadAllParks = async () => {
    if (!supabase) {
      setQualityError('Supabase client not initialized');
      return;
    }

    setQualityLoading(true);
    setQualityError(null);
    try {
      // Direct Supabase query - Excel-like direct database access
      let query = supabase
        .from('parks')
        .select('*');

      // Apply filters
      if (qualityFilters.state) {
        query = query.eq('state', qualityFilters.state);
      }
      if (qualityFilters.agency) {
        query = query.eq('agency', qualityFilters.agency);
      }
      if (qualityFilters.dataSource) {
        query = query.eq('data_source', qualityFilters.dataSource);
      }

      const { data: parks, error } = await query;

      if (error) {
        throw new Error(error.message || 'Failed to load parks');
      }

      if (parks) {
        // Calculate quality scores for each park
        const parksWithScores = parks.map(park => ({
          ...park,
          qualityScore: calculateDataQualityScore(park),
          // Ensure data_source_priority is included (may be null)
          data_source_priority: park.data_source_priority || 0
        }));

        setAllParks(parksWithScores);
        // Apply current search query and filters
        let filtered = parksWithScores;
        
        // Apply search filter
        if (searchQuery) {
          const searchLower = searchQuery.toLowerCase();
          filtered = filtered.filter(park => {
            return (
              (park.name && park.name.toLowerCase().includes(searchLower)) ||
              (park.city && park.city.toLowerCase().includes(searchLower)) ||
              (park.county && park.county.toLowerCase().includes(searchLower)) ||
              (park.state && park.state.toLowerCase().includes(searchLower)) ||
              (park.agency && park.agency.toLowerCase().includes(searchLower)) ||
              (park.data_source && park.data_source.toLowerCase().includes(searchLower))
            );
          });
        }
        
        setFilteredParks(filtered);
      }
    } catch (err) {
      console.error('Load parks error:', err);
      setQualityError(`Error loading parks: ${err.message}`);
    } finally {
      setQualityLoading(false);
    }
  };

  // Apply filters (state, agency, data source) and search query
  const applyFilters = () => {
    let filtered = [...allParks];
    
    // Apply dropdown filters
    if (qualityFilters.state) {
      // qualityFilters.state is now the state code (e.g., "GA", "NC")
      const stateCode = qualityFilters.state.toUpperCase();
      
      // Filter by state code (all states are now normalized to codes like "GA", "NC")
      filtered = filtered.filter(p => {
        const parkState = (p.state || '').toUpperCase();
        return parkState === stateCode;
      });
    }
    if (qualityFilters.agency) {
      filtered = filtered.filter(p => p.agency === qualityFilters.agency);
    }
    if (qualityFilters.dataSource) {
      filtered = filtered.filter(p => p.data_source === qualityFilters.dataSource);
    }
    
    // Apply search query
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(park => {
        if (park.name?.toLowerCase().includes(queryLower)) return true;
        if (park.state?.toLowerCase().includes(queryLower)) return true;
        if (park.agency?.toLowerCase().includes(queryLower)) return true;
        if (park.county?.toLowerCase().includes(queryLower)) return true;
        if (park.city?.toLowerCase().includes(queryLower)) return true;
        if (park.address?.toLowerCase().includes(queryLower)) return true;
        if (park.description?.toLowerCase().includes(queryLower)) return true;
        return false;
      });
    }
    
    setFilteredParks(filtered);
  };


  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    // Excel-like: Filter client-side from already-loaded parks
    // No API calls - instant filtering as you type
    if (!query.trim()) {
      // If no search query, show all parks (or apply other filters)
      applyFilters();
      return;
    }
    
    // Filter parks client-side based on search query
    const queryLower = query.toLowerCase().trim();
    const filtered = allParks.filter(park => {
      // Search across multiple fields like Excel
      if (park.name?.toLowerCase().includes(queryLower)) return true;
      if (park.state?.toLowerCase().includes(queryLower)) return true;
      if (park.agency?.toLowerCase().includes(queryLower)) return true;
      if (park.county?.toLowerCase().includes(queryLower)) return true;
      if (park.city?.toLowerCase().includes(queryLower)) return true;
      if (park.address?.toLowerCase().includes(queryLower)) return true;
      if (park.description?.toLowerCase().includes(queryLower)) return true;
      // Search in any field that might contain the query
      return false;
    });
    
    setFilteredParks(filtered);
  };

  const loadQualityBreakdown = async (groupBy) => {
    if (!filteredParks || filteredParks.length === 0) {
      setQualityError('Please search for parks first');
      return;
    }

    setBreakdownLoading(true);
    setQualityError(null);
    try {
      // Calculate breakdown client-side from already-loaded parks
      const fields = ['name', 'description', 'website', 'phone', 'address'];
      const matrix = calculateQualityBreakdownMatrix(filteredParks, groupBy, fields);
      
      setQualityBreakdown(matrix);
      setBreakdownGroupBy(groupBy);
    } catch (err) {
      console.error('Breakdown error:', err);
      setQualityError(`Error: ${err.message}`);
    } finally {
      setBreakdownLoading(false);
    }
  };

  // loadFilteredParks is no longer needed - filtering is done client-side via applyFilters()

  const handleSaveEdits = async () => {
    if (editedParks.size === 0) {
      return;
    }

    setSaveLoading(true);
    setSaveStatus(null);

    try {
      // Convert Map to array of updates
      const updates = Array.from(editedParks.entries()).map(([parkId, changes]) => ({
        id: parkId,
        ...changes
      }));

      const response = await fetch('/api/admin/data-quality/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates }),
      });

      const data = await response.json();

      if (!response.ok) {
        setSaveStatus({ type: 'error', message: data.error || 'Failed to save changes' });
        return;
      }

      if (data.success) {
        setSaveStatus({ type: 'success', message: `Successfully updated ${data.updated} park(s)` });
        setEditedParks(new Map());
        setEditingCell(null);
        
        // Reload parks to reflect changes
        await loadAllParks();
        
        // Clear status after 3 seconds
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        setSaveStatus({ type: 'error', message: data.error || 'Failed to save changes' });
      }
    } catch (err) {
      console.error('Save edits error:', err);
      setSaveStatus({ type: 'error', message: `Error: ${err.message}` });
    } finally {
      setSaveLoading(false);
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
      // Use POST with action=delete since some proxies don't support DELETE
      const response = await fetch('/api/admin/data-quality', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete',
          parkIds: Array.from(selectedParks)
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setQualityError(data.error || 'Failed to delete parks');
        return;
      }

      if (data.success) {
        const deletedCount = data.deleted || selectedParks.size;
        alert(`Successfully deleted ${deletedCount} park(s)`);
        setSelectedParks(new Set());
        
        // Clear state first
        setAllParks([]);
        setFilteredParks([]);
        setQualityAnalysis(null);
        
        // Force reload - wait a bit to ensure state is cleared
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Reload parks and analysis
        await loadAllParks();
        await loadQualityAnalysis();
        
        // Also refresh the filtered parks display
        if (searchQuery) {
          // Reapply search filter
          const searchLower = searchQuery.toLowerCase();
          const filtered = allParks.filter(park => {
            return (
              (park.name && park.name.toLowerCase().includes(searchLower)) ||
              (park.city && park.city.toLowerCase().includes(searchLower)) ||
              (park.county && park.county.toLowerCase().includes(searchLower)) ||
              (park.state && park.state.toLowerCase().includes(searchLower)) ||
              (park.agency && park.agency.toLowerCase().includes(searchLower)) ||
              (park.data_source && park.data_source.toLowerCase().includes(searchLower))
            );
          });
          setFilteredParks(filtered);
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
        <button
          className={`tab ${activeTab === 'geocode' ? 'active' : ''}`}
          onClick={() => setActiveTab('geocode')}
        >
          📍 Geocode Missing Coordinates
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
              <label htmlFor="sync-source-type">1️⃣ Select Source Type:</label>
              <select 
                id="sync-source-type"
                name="syncSourceType"
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
              <label htmlFor="sync-api-key">2️⃣ API Key (required for NPS and Recreation.gov):</label>
              <input
                id="sync-api-key"
                name="syncApiKey"
                type="password"
                value={syncApiKey}
                onChange={(e) => setSyncApiKey(e.target.value)}
                placeholder="Enter your API key"
                disabled={syncLoading}
                style={{ width: '100%', padding: '8px', marginTop: '5px' }}
              />
              <p style={{ marginTop: '5px', fontSize: '0.9rem', color: '#666' }}>
                <strong>For NPS:</strong> Get your API key from <a href="https://www.nps.gov/subjects/developer/get-started.htm" target="_blank" rel="noopener noreferrer">developer.nps.gov</a>
                <br />
                <strong>For Recreation.gov:</strong> Get your API key from <a href="https://ridb.recreation.gov/" target="_blank" rel="noopener noreferrer">ridb.recreation.gov</a>
              </p>
            </div>

            <div className="form-group">
              <button
                onClick={handleApiSync}
                disabled={!syncSourceType || syncLoading || ((syncSourceType === 'NPS' || syncSourceType === 'Recreation.gov') && !syncApiKey.trim())}
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
                    
                    {/* Show enrichment option for Recreation.gov */}
                    {syncSourceType === 'Recreation.gov' && syncResult.parksFound > 0 && (
                      <div style={{ marginTop: '20px', padding: '15px', background: '#e8f4f8', borderRadius: '8px', border: '2px solid #007bff' }}>
                        <h4 style={{ marginTop: 0 }}>🚀 Next Step: Enrich Facilities</h4>
                        <p style={{ marginBottom: '15px' }}>
                          Your facilities have been synced! Now enrich them with detailed data from the Recreation.gov API.
                          This will run in the background and take approximately 2.5 hours for ~15,000 facilities.
                        </p>
                        <div style={{ marginBottom: '10px' }}>
                          <label style={{ display: 'block', marginBottom: '5px' }}>
                            Batch Size (facilities per batch):
                          </label>
                          <input
                            type="number"
                            value={enrichBatchSize}
                            onChange={(e) => setEnrichBatchSize(e.target.value)}
                            min="10"
                            max="100"
                            disabled={enrichLoading}
                            style={{ width: '100px', padding: '5px' }}
                          />
                          <span style={{ marginLeft: '10px', fontSize: '0.9rem', color: '#666' }}>
                            (Default: 50, recommended for ~2.5 hour completion)
                          </span>
                        </div>
                        <button
                          onClick={handleRecreationGovEnrichment}
                          disabled={enrichLoading || !syncApiKey.trim()}
                          className="primary-button"
                          style={{ width: '100%' }}
                        >
                          {enrichLoading ? '⏳ Starting Enrichment...' : '🚀 Start Background Enrichment'}
                        </button>
                      </div>
                    )}
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

            {/* Recreation.gov Enrichment Section (standalone) */}
            {syncSourceType === 'Recreation.gov' && (
              <div style={{ marginTop: '30px', padding: '20px', background: '#e8f4f8', borderRadius: '8px', border: '1px solid #007bff' }}>
                <h3 style={{ marginTop: 0 }}>🔧 Recreation.gov Enrichment</h3>
                <p style={{ marginBottom: '15px' }}>
                  Enrich existing Recreation.gov facilities with detailed data. This process runs in the background
                  and will update facilities with information from the facility{'{id}'} endpoint.
                </p>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', marginBottom: '5px' }}>
                    Batch Size (facilities per batch):
                  </label>
                  <input
                    type="number"
                    value={enrichBatchSize}
                    onChange={(e) => setEnrichBatchSize(e.target.value)}
                    min="10"
                    max="100"
                    disabled={enrichLoading}
                    style={{ width: '100px', padding: '5px' }}
                  />
                  <span style={{ marginLeft: '10px', fontSize: '0.9rem', color: '#666' }}>
                    (Default: 50)
                  </span>
                </div>
                <button
                  onClick={handleRecreationGovEnrichment}
                  disabled={enrichLoading || !syncApiKey.trim()}
                  className="primary-button"
                >
                  {enrichLoading ? '⏳ Starting Enrichment...' : '🚀 Start Enrichment'}
                </button>
                
                {enrichError && (
                  <div className="error-message" style={{ marginTop: '15px', padding: '15px', background: '#fee', borderRadius: '8px' }}>
                    <strong>❌ Error:</strong> {enrichError}
                  </div>
                )}
                
                {enrichResult && (
                  <div className="success-message" style={{ marginTop: '15px', padding: '15px', background: '#f0f7ed', borderRadius: '8px' }}>
                    <strong>✅ Enrichment Started!</strong>
                    <p style={{ marginTop: '10px', marginBottom: 0 }}>
                      {enrichResult.message || 'The enrichment process is running in the background.'}
                    </p>
                    {enrichResult.eventId && (
                      <p style={{ marginTop: '5px', fontSize: '0.9rem', color: '#666' }}>
                        Event ID: {typeof enrichResult.eventId === 'string' ? enrichResult.eventId : enrichResult.eventId?.ids?.[0] || 'Unknown'}
                      </p>
                    )}
                    {enrichResult.details && (
                      <p style={{ marginTop: '5px', fontSize: '0.85rem', color: '#666', fontStyle: 'italic' }}>
                        {enrichResult.details}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Saved API Configurations */}
            {savedApiConfigs.length > 0 && (
              <div style={{ marginTop: '30px', padding: '20px', background: '#f0f7ed', borderRadius: '8px' }}>
                <h4>💾 Saved API Configurations:</h4>
                <div style={{ marginTop: '15px' }}>
                  {savedApiConfigs.map((config, index) => (
                    <div key={index} style={{ 
                      padding: '12px', 
                      marginBottom: '10px', 
                      background: '#fff', 
                      borderRadius: '6px',
                      border: '1px solid #ddd',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <strong>{config.sourceType}</strong>
                        <span style={{ marginLeft: '10px', fontSize: '0.9rem', color: '#666' }}>
                          Last used: {new Date(config.lastUsed).toLocaleDateString()}
                        </span>
                        <div style={{ marginTop: '5px', fontSize: '0.85rem', color: '#999' }}>
                          API Key: {config.apiKey.substring(0, 10)}...
                        </div>
                      </div>
                      <div>
                        <button
                          onClick={() => loadApiConfig(config)}
                          style={{ 
                            marginRight: '8px',
                            padding: '6px 12px',
                            background: '#007bff',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Load
                        </button>
                        <button
                          onClick={() => deleteApiConfig(config.sourceType)}
                          style={{ 
                            padding: '6px 12px',
                            background: '#dc3545',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== GEOCODE MISSING COORDINATES TAB ==================== */}
        {activeTab === 'geocode' && (
          <div className="section">
            <h2>Geocode Missing Data</h2>
            <p className="section-description">
              Find parks missing coordinates or state and geocode them using Mapbox API or calculate from geometry.
            </p>

            <div className="form-group">
              <label>Geocode Type:</label>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '20px' }}>
                  <input
                    type="radio"
                    value="coordinates"
                    checked={geocodeType === 'coordinates'}
                    onChange={(e) => setGeocodeType(e.target.value)}
                  />
                  Missing Coordinates
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="radio"
                    value="state"
                    checked={geocodeType === 'state'}
                    onChange={(e) => setGeocodeType(e.target.value)}
                  />
                  Missing State (has coordinates)
                </label>
              </div>
              <label>Process Options:</label>
              {geocodeType === 'coordinates' && (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={geocodeUseGeometry}
                      onChange={(e) => setGeocodeUseGeometry(e.target.checked)}
                    />
                    Calculate centroids from geometry first (faster, free)
                  </label>
                </div>
              )}
              <div style={{ marginBottom: '15px' }}>
                <label>Limit (parks per batch):</label>
                <input
                  type="number"
                  value={geocodeLimit}
                  onChange={(e) => setGeocodeLimit(parseInt(e.target.value) || 50)}
                  min="1"
                  max="100"
                  style={{ width: '100px', padding: '8px' }}
                />
                <span style={{ marginLeft: '10px', color: '#666' }}>Process 50 parks at a time recommended</span>
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label>Filter by State (optional):</label>
                <select
                  value={geocodeState}
                  onChange={(e) => setGeocodeState(e.target.value)}
                  style={{ width: '200px', padding: '8px' }}
                >
                  <option value="">All States</option>
                  {states.map(state => (
                    <option key={state.id} value={state.state_code}>{state.state_code} - {state.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleGeocode}
              disabled={geocodeLoading}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: geocodeLoading ? 'not-allowed' : 'pointer',
                opacity: geocodeLoading ? 0.6 : 1
              }}
            >
              {geocodeLoading ? 'Processing...' : 'Start Geocoding'}
            </button>

            {geocodeResult && (
              <div className="success-message" style={{ marginTop: '20px', padding: '20px', background: '#f0f7ed', borderRadius: '8px' }}>
                <h3 style={{ marginTop: 0 }}>✅ Geocoding Complete!</h3>
                <ul style={{ textAlign: 'left', display: 'inline-block' }}>
                  <li><strong>Parks Processed:</strong> {geocodeResult.parksProcessed || 0}</li>
                  <li><strong>Parks Fixed:</strong> {geocodeResult.parksFixed || 0}</li>
                  <li><strong>Parks Failed:</strong> {geocodeResult.parksFailed || 0}</li>
                  <li><strong>Parks Skipped:</strong> {geocodeResult.parksSkipped || 0}</li>
                </ul>
                {geocodeResult.errors && geocodeResult.errors.length > 0 && (
                  <div style={{ marginTop: '15px', padding: '10px', background: '#fff3cd', borderRadius: '5px' }}>
                    <strong>Errors:</strong>
                    <ul style={{ textAlign: 'left', marginTop: '5px' }}>
                      {geocodeResult.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err.park}: {err.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {geocodeError && (
              <div className="error-message" style={{ marginTop: '20px', padding: '20px', background: '#fee', borderRadius: '8px' }}>
                <h3 style={{ marginTop: 0 }}>❌ Error:</h3>
                <pre style={{ whiteSpace: 'pre-wrap', textAlign: 'left' }}>{geocodeError}</pre>
              </div>
            )}
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
              Search and filter parks, review data quality, and clean up your database
            </p>

            {/* Search Bar */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Search by city, metro, county, state, federal agency, or any keyword..."
                  disabled={qualityLoading}
                  style={{
                    width: '100%',
                    padding: '12px 45px 12px 15px',
                    fontSize: '1rem',
                    border: '2px solid #ddd',
                    borderRadius: '8px',
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{
                  position: 'absolute',
                  right: '15px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '1.2rem'
                }}>🔍</span>
              </div>
              {allParks.length > 0 && (
                <p style={{ marginTop: '8px', fontSize: '0.9rem', color: '#666' }}>
                  {searchQuery 
                    ? `Showing ${filteredParks.length} of ${allParks.length} parks${searchQuery ? ` matching "${searchQuery}"` : ''}`
                    : `Showing ${filteredParks.length} of ${allParks.length} parks`}
                </p>
              )}
            </div>

            {/* Filters */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
              <div className="form-group">
                <label>Filter by State:</label>
                <select
                  value={qualityFilters.state}
                  onChange={(e) => {
                    setQualityFilters({ ...qualityFilters, state: e.target.value });
                    setTimeout(() => applyFilters(), 0);
                  }}
                  disabled={qualityLoading}
                >
                  <option value="">All States</option>
                  {states.map(state => (
                    <option key={state.id} value={state.state_code}>{state.state_code} - {state.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Filter by Agency:</label>
                <select
                  value={qualityFilters.agency}
                  onChange={(e) => {
                    setQualityFilters({ ...qualityFilters, agency: e.target.value });
                    setTimeout(() => applyFilters(), 0);
                  }}
                  disabled={qualityLoading}
                  style={{ width: '100%', padding: '8px' }}
                >
                  <option value="">All Agencies</option>
                  {agencyOptions.map(agency => (
                    <option key={agency} value={agency}>{agency}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Filter by Data Source:</label>
                <select
                  value={qualityFilters.dataSource}
                  onChange={(e) => {
                    setQualityFilters({ ...qualityFilters, dataSource: e.target.value });
                    setTimeout(() => applyFilters(), 0);
                  }}
                  disabled={qualityLoading}
                  style={{ width: '100%', padding: '8px' }}
                >
                  <option value="">All Data Sources</option>
                  {dataSourceOptions.map(source => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>
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


            {/* Parks Table */}
            {allParks.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3>📋 Parks ({filteredParks.length})</h3>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {editedParks.size > 0 && (
                      <>
                        <button
                          onClick={handleSaveEdits}
                          disabled={saveLoading}
                          className="primary-button"
                          style={{ background: '#4CAF50', fontSize: '0.9rem', padding: '6px 12px' }}
                        >
                          {saveLoading ? '⏳ Saving...' : `💾 Save Changes (${editedParks.size})`}
                        </button>
                        <button
                          onClick={() => {
                            setEditedParks(new Map());
                            setEditingCell(null);
                            setSaveStatus(null);
                          }}
                          disabled={saveLoading}
                          className="primary-button"
                          style={{ background: '#666', fontSize: '0.9rem', padding: '6px 12px' }}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {saveStatus && (
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '0.85rem',
                        background: saveStatus.type === 'success' ? '#d4edda' : '#f8d7da',
                        color: saveStatus.type === 'success' ? '#155724' : '#721c24'
                      }}>
                        {saveStatus.message}
                      </span>
                    )}
                    <button
                      onClick={selectAllParks}
                      className="primary-button"
                      style={{ fontSize: '0.9rem', padding: '6px 12px' }}
                      disabled={filteredParks.length === 0}
                    >
                      {selectedParks.size === filteredParks.length && filteredParks.length > 0 ? 'Deselect All' : 'Select All'}
                    </button>
                    {selectedParks.size > 0 && (
                      <button
                        onClick={handleDeleteParks}
                        disabled={deleteLoading}
                        className="primary-button"
                        style={{ background: '#ff6b6b', fontSize: '0.9rem', padding: '6px 12px' }}
                      >
                        {deleteLoading ? '⏳ Deleting...' : `🗑️ Delete (${selectedParks.size})`}
                      </button>
                    )}
                  </div>
                </div>

                {filteredParks.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', background: '#f9f9f9', borderRadius: '8px' }}>
                    <p style={{ color: '#666' }}>No parks match your search criteria.</p>
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setFilteredParks(allParks);
                      }}
                      className="primary-button"
                      style={{ marginTop: '15px', fontSize: '0.9rem' }}
                    >
                      Clear Search
                    </button>
                  </div>
                ) : (
                  <div style={{ border: '1px solid #ddd', borderRadius: '8px', background: '#fff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ background: '#f5f5f5', position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: '600' }}>
                            <input
                              type="checkbox"
                              checked={selectedParks.size === filteredParks.length && filteredParks.length > 0}
                              onChange={selectAllParks}
                            />
                          </th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: '600' }}>Name</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: '600' }}>State</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: '600' }}>Agency</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: '600' }}>Data Source</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: '600' }}>Website</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: '600' }}>Acres</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: '600' }}>Quality</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: '600' }}>Priority</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredParks.map((park, idx) => (
                          <tr 
                            key={park.id} 
                            style={{ 
                              borderBottom: '1px solid #eee',
                              background: idx % 2 === 0 ? '#fff' : '#fafafa'
                            }}
                          >
                            <td style={{ padding: '12px' }}>
                              <input
                                type="checkbox"
                                checked={selectedParks.has(park.id)}
                                onChange={() => toggleParkSelection(park.id)}
                              />
                            </td>
                            <EditableCell
                              parkId={park.id}
                              field="name"
                              value={park.name || 'Unnamed'}
                              editedValue={editedParks.get(park.id)?.name}
                              isEditing={editingCell?.parkId === park.id && editingCell?.field === 'name'}
                              onStartEdit={() => setEditingCell({ parkId: park.id, field: 'name' })}
                              onSave={(value) => {
                                const updates = editedParks.get(park.id) || {};
                                updates.name = value;
                                setEditedParks(new Map(editedParks).set(park.id, updates));
                                setEditingCell(null);
                              }}
                              onCancel={() => setEditingCell(null)}
                            />
                            <EditableCell
                              parkId={park.id}
                              field="state"
                              value={park.state || 'N/A'}
                              editedValue={editedParks.get(park.id)?.state}
                              isEditing={editingCell?.parkId === park.id && editingCell?.field === 'state'}
                              onStartEdit={() => setEditingCell({ parkId: park.id, field: 'state' })}
                              onSave={(value) => {
                                const updates = editedParks.get(park.id) || {};
                                updates.state = value;
                                setEditedParks(new Map(editedParks).set(park.id, updates));
                                setEditingCell(null);
                              }}
                              onCancel={() => setEditingCell(null)}
                            />
                            <EditableCell
                              parkId={park.id}
                              field="agency"
                              value={park.agency || 'N/A'}
                              editedValue={editedParks.get(park.id)?.agency}
                              isEditing={editingCell?.parkId === park.id && editingCell?.field === 'agency'}
                              onStartEdit={() => setEditingCell({ parkId: park.id, field: 'agency' })}
                              onSave={(value) => {
                                const updates = editedParks.get(park.id) || {};
                                updates.agency = value;
                                setEditedParks(new Map(editedParks).set(park.id, updates));
                                setEditingCell(null);
                              }}
                              onCancel={() => setEditingCell(null)}
                            />
                            <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>
                              {park.data_source || 'N/A'}
                            </td>
                            <EditableCell
                              parkId={park.id}
                              field="website"
                              value={park.website || ''}
                              editedValue={editedParks.get(park.id)?.website}
                              isEditing={editingCell?.parkId === park.id && editingCell?.field === 'website'}
                              onStartEdit={() => setEditingCell({ parkId: park.id, field: 'website' })}
                              onSave={(value) => {
                                const updates = editedParks.get(park.id) || {};
                                updates.website = value;
                                setEditedParks(new Map(editedParks).set(park.id, updates));
                                setEditingCell(null);
                              }}
                              onCancel={() => setEditingCell(null)}
                            />
                            <EditableCell
                              parkId={park.id}
                              field="acres"
                              value={park.acres ? park.acres.toFixed(2) : 'N/A'}
                              editedValue={editedParks.get(park.id)?.acres}
                              isEditing={editingCell?.parkId === park.id && editingCell?.field === 'acres'}
                              onStartEdit={() => setEditingCell({ parkId: park.id, field: 'acres' })}
                              onSave={(value) => {
                                const updates = editedParks.get(park.id) || {};
                                const numValue = parseFloat(value);
                                updates.acres = isNaN(numValue) ? null : numValue;
                                setEditedParks(new Map(editedParks).set(park.id, updates));
                                setEditingCell(null);
                              }}
                              onCancel={() => setEditingCell(null)}
                              type="number"
                            />
                            <td style={{ padding: '12px' }}>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.85rem',
                                fontWeight: '500',
                                background: park.qualityScore >= 80 ? '#d4edda' :
                                           park.qualityScore >= 60 ? '#d1ecf1' :
                                           park.qualityScore >= 40 ? '#fff3cd' : '#f8d7da',
                                color: park.qualityScore >= 80 ? '#155724' :
                                       park.qualityScore >= 60 ? '#0c5460' :
                                       park.qualityScore >= 40 ? '#856404' : '#721c24'
                              }}>
                                {park.qualityScore || 0}/100
                              </span>
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.85rem',
                                fontWeight: '500',
                                background: park.data_source_priority >= 90 ? '#d4edda' :
                                           park.data_source_priority >= 80 ? '#d1ecf1' :
                                           park.data_source_priority >= 60 ? '#fff3cd' : '#f8d7da',
                                color: park.data_source_priority >= 90 ? '#155724' :
                                       park.data_source_priority >= 80 ? '#0c5460' :
                                       park.data_source_priority >= 60 ? '#856404' : '#721c24'
                              }}>
                                {park.data_source_priority || 0}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {allParks.length === 0 && !qualityLoading && (
              <div style={{ padding: '40px', textAlign: 'center', background: '#f9f9f9', borderRadius: '8px', marginTop: '20px' }}>
                <p style={{ color: '#666', marginBottom: '15px' }}>Click "🔄 Refresh Data" to load parks, or start typing in the search bar to search</p>
                <button
                  onClick={loadAllParks}
                  disabled={qualityLoading}
                  className="primary-button"
                >
                  {qualityLoading ? '⏳ Loading...' : '🔄 Load Parks'}
                </button>
              </div>
            )}
            
            {allParks.length > 0 && filteredParks.length === 0 && !qualityLoading && (
              <div style={{ padding: '40px', textAlign: 'center', background: '#f9f9f9', borderRadius: '8px', marginTop: '20px' }}>
                <p style={{ color: '#666' }}>No parks found matching your search/filter criteria</p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setQualityFilters({ state: '', agency: '', dataSource: '' });
                    setFilteredParks(allParks);
                  }}
                  className="primary-button"
                  style={{ marginTop: '10px' }}
                >
                  Clear Filters
                </button>
              </div>
            )}

            {/* Quality Breakdown Matrix Table */}
            {filteredParks.length > 0 && (
              <div style={{ marginTop: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3>📊 Quality Breakdown Matrix</h3>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => loadQualityBreakdown('state')}
                      disabled={breakdownLoading}
                      className="primary-button"
                      style={{
                        fontSize: '0.85rem',
                        padding: '6px 12px',
                        background: breakdownGroupBy === 'state' ? '#4CAF50' : '#666'
                      }}
                    >
                      State Parks
                    </button>
                    <button
                      onClick={() => loadQualityBreakdown('agency')}
                      disabled={breakdownLoading}
                      className="primary-button"
                      style={{
                        fontSize: '0.85rem',
                        padding: '6px 12px',
                        background: breakdownGroupBy === 'agency' ? '#4CAF50' : '#666'
                      }}
                    >
                      Federal Agencies
                    </button>
                    <button
                      onClick={() => loadQualityBreakdown('agency')}
                      disabled={breakdownLoading}
                      className="primary-button"
                      style={{
                        fontSize: '0.85rem',
                        padding: '6px 12px',
                        background: breakdownGroupBy === 'agency' ? '#4CAF50' : '#666'
                      }}
                    >
                      All Agencies
                    </button>
                    <button
                      onClick={() => loadQualityBreakdown('county')}
                      disabled={breakdownLoading}
                      className="primary-button"
                      style={{
                        fontSize: '0.85rem',
                        padding: '6px 12px',
                        background: breakdownGroupBy === 'county' ? '#4CAF50' : '#666'
                      }}
                    >
                      Counties
                    </button>
                    <button
                      onClick={() => loadQualityBreakdown('city')}
                      disabled={breakdownLoading}
                      className="primary-button"
                      style={{
                        fontSize: '0.85rem',
                        padding: '6px 12px',
                        background: breakdownGroupBy === 'city' ? '#4CAF50' : '#666'
                      }}
                    >
                      Cities
                    </button>
                  </div>
                </div>

                {breakdownLoading && (
                  <div style={{ padding: '20px', textAlign: 'center' }}>
                    <p>Loading breakdown...</p>
                  </div>
                )}

                {qualityBreakdown && qualityBreakdown.rows && qualityBreakdown.rows.length > 0 && !breakdownLoading && (
                  <div style={{ border: '1px solid #ddd', borderRadius: '8px', background: '#fff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ background: '#f5f5f5', position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', borderRight: '2px solid #ddd', fontWeight: '600', position: 'sticky', left: 0, background: '#f5f5f5' }}>
                            {breakdownGroupBy.charAt(0).toUpperCase() + breakdownGroupBy.slice(1)}
                          </th>
                          {qualityBreakdown.columns && qualityBreakdown.columns.map(column => (
                            <th key={column} style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ddd', fontWeight: '600', minWidth: '100px' }}>
                              {column.charAt(0).toUpperCase() + column.slice(1)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {qualityBreakdown.rows.map((row, idx) => (
                          <tr
                            key={row}
                            style={{
                              borderBottom: '1px solid #eee',
                              background: idx % 2 === 0 ? '#fff' : '#fafafa'
                            }}
                          >
                            <td style={{ padding: '12px', fontWeight: '500', borderRight: '2px solid #ddd', position: 'sticky', left: 0, background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                              {row}
                            </td>
                            {qualityBreakdown.columns.map(column => {
                              const score = qualityBreakdown.matrix[row]?.[column] || 0
                              const scoreColor = score >= 80 ? '#d4edda' :
                                                score >= 60 ? '#d1ecf1' :
                                                score >= 40 ? '#fff3cd' : '#f8d7da'
                              const textColor = score >= 80 ? '#155724' :
                                               score >= 60 ? '#0c5460' :
                                               score >= 40 ? '#856404' : '#721c24'
                              
                              return (
                                <td key={column} style={{ padding: '12px', textAlign: 'center' }}>
                                  <span style={{
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.85rem',
                                    fontWeight: '500',
                                    background: scoreColor,
                                    color: textColor
                                  }}>
                                    {score.toFixed(0)}
                                  </span>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {qualityBreakdown && (!qualityBreakdown.rows || qualityBreakdown.rows.length === 0) && !breakdownLoading && (
                  <div style={{ padding: '20px', textAlign: 'center', background: '#f9f9f9', borderRadius: '8px' }}>
                    <p style={{ color: '#666' }}>No breakdown data available. Click a filter button above to load data.</p>
                  </div>
                )}
              </div>
            )}

            {/* Likely Non-Parks List */}
            {qualityAnalysis && qualityAnalysis.likelyNonParks.length > 0 && filteredParks.length === 0 && (
              <div style={{ marginTop: '30px' }}>
                <h3>🚫 Likely Non-Parks ({qualityAnalysis.likelyNonParks.length})</h3>
                <p style={{ color: '#666', marginBottom: '15px' }}>
                  These parks may be offices, facilities, or other non-park locations
                </p>
                <div style={{ border: '1px solid #ddd', borderRadius: '8px' }}>
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

// EditableCell component for inline editing
function EditableCell({ value, editedValue, isEditing, onStartEdit, onSave, onCancel }) {
  const [localValue, setLocalValue] = useState(editedValue !== undefined ? editedValue : value);

  useEffect(() => {
    if (editedValue !== undefined) {
      setLocalValue(editedValue);
    } else {
      setLocalValue(value);
    }
  }, [editedValue, value]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onSave(localValue);
    } else if (e.key === 'Escape') {
      setLocalValue(editedValue !== undefined ? editedValue : value);
      onCancel();
    }
  };

  const handleBlur = () => {
    if (localValue !== value && localValue !== editedValue) {
      onSave(localValue);
    } else {
      onCancel();
    }
  };

  if (isEditing) {
    return (
      <td style={{ padding: '12px' }}>
        <input
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          autoFocus
          style={{
            width: '100%',
            padding: '4px 8px',
            border: '2px solid #4CAF50',
            borderRadius: '4px',
            fontSize: '0.9rem'
          }}
        />
      </td>
    );
  }

  const hasChanges = editedValue !== undefined && editedValue !== value;
  
  return (
    <td
      style={{
        padding: '12px',
        cursor: 'pointer',
        background: hasChanges ? '#fff9e6' : 'transparent',
        position: 'relative'
      }}
      onClick={onStartEdit}
      title="Click to edit"
    >
      {editedValue !== undefined ? editedValue : value}
      {hasChanges && (
        <span style={{
          position: 'absolute',
          right: '4px',
          top: '4px',
          fontSize: '0.7rem',
          color: '#ff9800'
        }}>●</span>
      )}
    </td>
  );
}

export default AdminPanel;
