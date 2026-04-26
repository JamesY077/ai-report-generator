import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { AppStage, AIConfig, UserPreferences, GenerationProgress } from '../types';

export interface AppState {
  stage: AppStage;
  aiConfig: AIConfig;
  userPreferences: UserPreferences;
  isConnected: boolean;
  generationProgress: GenerationProgress;
  leftPanelCollapsed: boolean;
  activeSection: string;
}

const savedConfig = localStorage.getItem('aiConfig');
const savedPrefs = localStorage.getItem('userPreferences');

const initialState: AppState = {
  stage: 'config',
  aiConfig: savedConfig
    ? JSON.parse(savedConfig)
    : { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o' },
  userPreferences: savedPrefs
    ? JSON.parse(savedPrefs)
    : { defaultWordCount: 15000, maxIterations: 5 },
  isConnected: false,
  generationProgress: { total: 0, completed: 0, currentSection: '', isGenerating: false },
  leftPanelCollapsed: false,
  activeSection: '',
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setStage(state, action: PayloadAction<AppStage>) {
      state.stage = action.payload;
    },
    setAIConfig(state, action: PayloadAction<AIConfig>) {
      state.aiConfig = action.payload;
      localStorage.setItem('aiConfig', JSON.stringify(action.payload));
    },
    setUserPreferences(state, action: PayloadAction<UserPreferences>) {
      state.userPreferences = action.payload;
      localStorage.setItem('userPreferences', JSON.stringify(action.payload));
    },
    setConnected(state, action: PayloadAction<boolean>) {
      state.isConnected = action.payload;
    },
    setGenerationProgress(state, action: PayloadAction<Partial<GenerationProgress>>) {
      state.generationProgress = { ...state.generationProgress, ...action.payload };
    },
    setLeftPanelCollapsed(state, action: PayloadAction<boolean>) {
      state.leftPanelCollapsed = action.payload;
    },
    setActiveSection(state, action: PayloadAction<string>) {
      state.activeSection = action.payload;
    },
  },
});

export const {
  setStage,
  setAIConfig,
  setUserPreferences,
  setConnected,
  setGenerationProgress,
  setLeftPanelCollapsed,
  setActiveSection,
} = appSlice.actions;

export default appSlice.reducer;
