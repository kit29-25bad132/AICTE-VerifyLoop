/// <reference types="vite/client" />

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types.js';

interface AuthContextType {
  currentUser: User;
  isAuthenticated: boolean;
  availableUsers: User[];
  login: (email: string, role?: UserRole) => Promise<boolean>;
  logout: () => void;
  switchUser: (user: User) => void;
}

// Get API base URL from environment or default to current origin
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const DEFAULT_USERS: User[] = [
  {
    id: 'usr-sub-01',
    email: 'submitter@institute.gov.in',
    name: 'SUBMITTER',
    role: 'SUBMITTER',
    department: 'Institute Administration',
    assignedProjects: ['Institute Operations']
  },
  {
    id: 'usr-mgr-01',
    email: 'reviewer@institute.gov.in',
    name: 'REVIEWER',
    role: 'REVIEWER',
    department: 'Review Committee',
    assignedProjects: ['Review Assignments']
  },
  {
    id: 'usr-analyst-01',
    email: 'analyst@institute.gov.in',
    name: 'ANALYST',
    role: 'ANALYST',
    department: 'Compliance Analytics',
    assignedProjects: ['Compliance Tracking']
  },
  {
    id: 'usr-viewer-01',
    email: 'viewer@institute.gov.in',
    name: 'VIEWER',
    role: 'VIEWER',
    department: 'Audit & Inspection',
    assignedProjects: ['Public Records']
  }
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem('aiCTE_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_USERS[0];
      }
    }
    return DEFAULT_USERS[0];
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('aiCTE_auth') === 'true';
  });
  const [availableUsers, setAvailableUsers] = useState<User[]>(DEFAULT_USERS);

  useEffect(() => {
    const url = `${API_BASE_URL}/api/auth/users`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.users && data.users.length > 0) {
          setAvailableUsers(data.users);
        }
      })
      .catch(() => {});
  }, []);

  const login = async (email: string, role?: UserRole): Promise<boolean> => {
    const matched = availableUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    const userToSet: User = matched || {
      id: `usr-${Date.now()}`,
      email,
      name: email.split('@')[0].toUpperCase(),
      role: role || 'ANALYST',
      department: 'General Operations',
      assignedProjects: ['Institute Operations']
    };

    setCurrentUser(userToSet);
    setIsAuthenticated(true);
    localStorage.setItem('aiCTE_user', JSON.stringify(userToSet));
    localStorage.setItem('aiCTE_auth', 'true');
    return true;
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('aiCTE_auth');
  };

  const switchUser = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('aiCTE_user', JSON.stringify(user));
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated,
        availableUsers,
        login,
        logout,
        switchUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};