import { configureStore } from '@reduxjs/toolkit';
import appReducer from './appSlice.ts';
import projectReducer from './projectSlice.ts';
import type { AppState } from './appSlice.ts';
import type { ProjectState } from './projectSlice.ts';

export const store = configureStore({
  reducer: {
    app: appReducer,
    project: projectReducer,
  },
});

export interface RootState {
  app: AppState;
  project: ProjectState;
}

export type AppDispatch = typeof store.dispatch;
