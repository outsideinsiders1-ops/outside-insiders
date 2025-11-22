# Supabase Frontend Access Best Practices

## Overview
Based on current best practices (2024), Supabase is designed to be accessed **directly from the client-side** using the anonymous (anon) key. Security is handled through **Row Level Security (RLS) policies**, not by hiding the API behind server routes.

## Recommended Architecture

### ✅ **Direct Client-Side Access (Recommended)**
- Use `@supabase/supabase-js` client directly in React components
- Expose the anon key publicly (it's safe when RLS is configured)
- All CRUD operations happen client-side
- Security via RLS policies in Supabase

### ❌ **API Routes (Only When Needed)**
- Only use API routes for:
  - Operations requiring service role key (admin operations)
  - Complex business logic that shouldn't be in client
  - Hiding sensitive operations
  - Server-side data processing

## Current Issues with Our Setup

1. **We're using API routes for everything** - This is causing 405 errors and unnecessary complexity
2. **We should use direct Supabase client calls** - Simpler, faster, more reliable
3. **RLS policies should handle security** - Not API route authentication

## Recommended Changes

### 1. Use Direct Client Calls for Admin Panel

Instead of:
```javascript
// ❌ Current: API route
const response = await fetch('/api/admin/data-quality?action=filter');
const data = await response.json();
```

Use:
```javascript
// ✅ Better: Direct Supabase call
const { data, error } = await supabase
  .from('parks')
  .select('*')
  .eq('state', state)
  .eq('agency', agency);
```

### 2. Set Up Row Level Security (RLS)

Create RLS policies in Supabase SQL Editor:

```sql
-- Allow authenticated admin users to manage parks
CREATE POLICY "Admin users can manage parks" ON parks
  FOR ALL
  USING (auth.role() = 'authenticated' AND auth.jwt() ->> 'is_admin' = 'true');

-- Or for public read, admin write:
CREATE POLICY "Public can read parks" ON parks
  FOR SELECT
  USING (true);

CREATE POLICY "Admin can manage parks" ON parks
  FOR ALL
  USING (auth.role() = 'authenticated');
```

### 3. Authentication for Admin Panel

Add authentication to restrict admin access:

```javascript
// In admin panel
const [user, setUser] = useState(null);

useEffect(() => {
  // Check if user is authenticated
  supabase.auth.getUser().then(({ data: { user } }) => {
    setUser(user);
    if (!user) {
      // Redirect to login
      router.push('/admin/login');
    }
  });
}, []);
```

## Benefits of Direct Client Access

1. **Simpler Code** - No API routes to maintain
2. **Better Performance** - Direct database connection
3. **Real-time Updates** - Easy to add real-time subscriptions
4. **Fewer Errors** - No 405/404 issues with routes
5. **Better DX** - Supabase client has great TypeScript support

## When to Use API Routes

Only use API routes for:
- File uploads that need server-side processing
- Operations requiring service role key
- Complex data transformations
- Third-party API integrations
- Webhook handlers

## Migration Path

1. **Keep API routes for file uploads** (they need server-side processing)
2. **Convert data-quality operations to direct Supabase calls**
3. **Add RLS policies** for security
4. **Add authentication** to admin panel
5. **Remove unnecessary API routes**

## Security Considerations

- ✅ Anon key is safe to expose (with RLS)
- ✅ RLS policies control data access
- ✅ Service role key should NEVER be exposed
- ✅ Use authentication for admin operations
- ✅ Validate data on both client and server (via RLS)

