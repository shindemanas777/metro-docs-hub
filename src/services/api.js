import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: process.env.NODE_ENV === 'production' 
    ? 'https://api.kmrl-docs.com/api' 
    : 'http://localhost:3000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('kmrl_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('kmrl_token');
      localStorage.removeItem('kmrl_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API endpoints - These will be integrated with backend later
const apiEndpoints = {
  // Authentication
  login: (credentials) => api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),

  // Documents
  getDocuments: (role = 'employee') => api.get(`/documents?role=${role}`),
  getDocument: (id) => api.get(`/documents/${id}`),
  uploadDocument: (formData) => api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  approveDocument: (id, notes) => api.post(`/documents/${id}/approve`, { notes }),
  rejectDocument: (id, notes) => api.post(`/documents/${id}/reject`, { notes }),

  // Summaries
  getSummary: (id) => api.get(`/summaries/${id}`),
  translateSummary: (id, language) => api.post(`/summaries/${id}/translate`, { language }),

  // Users (Admin only)
  getUsers: () => api.get('/users'),
  createUser: (userData) => api.post('/users', userData),
  updateUser: (id, userData) => api.put(`/users/${id}`, userData),
  deleteUser: (id) => api.delete(`/users/${id}`),

  // Alerts
  getAlerts: () => api.get('/alerts'),
  markAlertRead: (id) => api.post(`/alerts/${id}/read`),

  // Analytics (Admin only)
  getAnalytics: () => api.get('/analytics'),
};

export default apiEndpoints;
export { api };