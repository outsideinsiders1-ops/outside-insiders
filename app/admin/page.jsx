'use client'

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { calculateDataQualityScore, calculateQualityBreakdownMatrix, analyzeParksQuality } from '../../lib/utils/data-quality.js';
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
  }, []);

  // Load all parks when Data Quality tab is active (Excel-like experience)
  useEffect(() => {
    if (activeTab === 'data-quality' && allParks.length === 0 && !qualityLoading) {
      loadAllParks();
    }
  }, [activeTab]);

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
    const useChunkedUpload = fileSizeMB > 50; // Use chunked upload for files > 50MB

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
          qualityScore: calculateDataQualityScore(park)
        }));

        setAllParks(parksWithScores);
        // Apply current search query if exists, otherwise show all
        if (searchQuery) {
          handleSearchChange({ target: { value: searchQuery } });
        } else {
          setFilteredParks(parksWithScores);
        }
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
      filtered = filtered.filter(p => p.state === qualityFilters.state);
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
        await loadQualityAnalysis();
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
              <label htmlFor="sync-api-url">2️⃣ Enter API URL:</label>
              <input
                id="sync-api-url"
                name="syncApiUrl"
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
              <label htmlFor="sync-api-key">3️⃣ API Key (if required):</label>
              <input
                id="sync-api-key"
                name="syncApiKey"
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
                <select
                  value={qualityFilters.agency}
                  onChange={(e) => setQualityFilters({ ...qualityFilters, agency: e.target.value })}
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
                  onChange={(e) => setQualityFilters({ ...qualityFilters, dataSource: e.target.value })}
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
                  <div style={{ maxHeight: '600px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '8px', background: '#fff' }}>
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
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: '600' }}>Acres</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: '600' }}>Quality</th>
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
                  <div style={{ maxHeight: '600px', overflow: 'auto', border: '1px solid #ddd', borderRadius: '8px', background: '#fff' }}>
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
