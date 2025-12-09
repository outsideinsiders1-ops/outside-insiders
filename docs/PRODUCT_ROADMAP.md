# Outside Insiders Product Roadmap

## Completed Features ✅

- Map-based park discovery interface
- Park filtering by type, agency, and amenities
- Park detail panels with boundaries
- Admin panel for data management
- API sync for NPS and Recreation.gov
- File upload for GeoJSON/Shapefiles
- Data quality scoring and management
- Mapbox GL JS integration with clustering

## Upcoming Features 🚀

### Geofencing & Location Notifications

**Status:** Planned  
**Priority:** Medium  
**Estimated Effort:** 2-3 weeks

#### Overview
Allow users to receive notifications when they cross park boundaries (enter or exit a park). This leverages Mapbox's geofencing capabilities and browser geolocation APIs.

#### Features
- **Real-time Location Tracking**
  - Background geolocation monitoring (with user permission)
  - Configurable update frequency to balance accuracy vs. battery life
  - Support for both foreground and background tracking

- **Park Boundary Detection**
  - Use existing park geometry data from PostGIS
  - Efficient point-in-polygon checks using spatial indexing
  - Handle multiple parks in proximity

- **Notification System**
  - Browser push notifications (when supported)
  - In-app notifications
  - Configurable notification preferences:
    - Notify on entry only
    - Notify on exit only
    - Notify on both
    - Quiet hours setting

- **User Preferences**
  - Enable/disable geofencing
  - Select parks to monitor (all parks, saved parks, nearby parks)
  - Notification sound/vibration preferences
  - Battery optimization settings

#### Technical Implementation Notes

1. **Mapbox Geofencing API**
   - Use Mapbox's geofencing service for accurate boundary detection
   - Consider using Turf.js for client-side point-in-polygon checks as fallback
   - Cache park boundaries locally for offline detection

2. **Browser APIs**
   - `navigator.geolocation.watchPosition()` for location tracking
   - Service Worker for background location monitoring
   - Web Push API for notifications

3. **Performance Considerations**
   - Spatial indexing (R-tree or similar) for efficient boundary checks
   - Debounce location updates to avoid excessive checks
   - Batch boundary queries when possible

4. **Privacy & Permissions**
   - Clear permission requests and explanations
   - Option to use approximate location for better privacy
   - Data retention policies for location history (if stored)

#### User Stories
- As a hiker, I want to be notified when I enter a new park so I can be aware of park rules and amenities
- As a camper, I want to know when I'm leaving a park boundary so I can plan my route
- As a user, I want to control which parks trigger notifications so I'm not overwhelmed

#### Future Enhancements
- Location history and trail tracking
- Share location with friends/family
- Integration with park check-in systems
- Offline geofencing support

---

## Other Planned Features

### Vector Tiles for Large Datasets
- Set up Martin or pg_tileserv for serving vector tiles
- Improve performance with 10,000+ parks
- Dynamic styling based on park attributes

### Enhanced Search
- Full-text search across park descriptions
- Search by amenities or activities
- Saved searches and alerts

### User Accounts & Favorites
- User authentication
- Save favorite parks
- Personal park lists
- Share park lists with others

### Mobile App
- Native iOS/Android apps
- Offline map support
- Enhanced geofencing capabilities
- Better battery optimization

---

## Notes

- This roadmap is subject to change based on user feedback and technical constraints
- Features are prioritized based on user value and implementation complexity
- Geofencing feature will require careful consideration of privacy and battery usage

