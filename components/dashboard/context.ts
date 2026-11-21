import { createContext, useContext } from 'react';

/** True when a screen (My store, Studio, Admin) is shown inside the dashboard frame, which has its own header and navigation. */
export const InDashboard = createContext(false);
export const useInDashboard = () => useContext(InDashboard);
