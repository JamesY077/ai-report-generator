import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { OutlineNode, Version, ProjectInfo, ChatMessage } from '../types';

export interface ProjectState {
  projectInfo: ProjectInfo | null;
  outline: OutlineNode[];
  versions: Version[];
  currentVersion: number;
  chatMessages: ChatMessage[];
  wordCountTarget: number;
}

const initialState: ProjectState = {
  projectInfo: null,
  outline: [],
  versions: [],
  currentVersion: 0,
  chatMessages: [],
  wordCountTarget: 15000,
};

const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    initProject(state, action: PayloadAction<ProjectInfo>) {
      state.projectInfo = action.payload;
      state.outline = [];
      state.versions = [];
      state.currentVersion = 0;
      state.chatMessages = [];
    },
    setOutline(state, action: PayloadAction<OutlineNode[]>) {
      state.outline = action.payload;
    },
    addVersion(state, action: PayloadAction<Version>) {
      state.versions.push(action.payload);
      state.currentVersion = action.payload.version;
    },
    updateVersionContent(
      state,
      action: PayloadAction<{ version: number; sectionId: string; content: string }>
    ) {
      const { version, sectionId, content } = action.payload;
      const v = state.versions.find((v) => v.version === version);
      if (v) {
        v.content[sectionId] = content;
        // 更新字数统计
        const totalWords = Object.values(v.content).join('').length;
        v.wordCount = totalWords;
      }
    },
    addChatMessage(state, action: PayloadAction<ChatMessage>) {
      state.chatMessages.push(action.payload);
    },
    clearChatMessages(state) {
      state.chatMessages = [];
    },
    setWordCountTarget(state, action: PayloadAction<number>) {
      state.wordCountTarget = action.payload;
    },
    setCurrentVersion(state, action: PayloadAction<number>) {
      state.currentVersion = action.payload;
    },
    resetProject() {
      return initialState;
    },
  },
});

export const {
  initProject,
  setOutline,
  addVersion,
  updateVersionContent,
  addChatMessage,
  clearChatMessages,
  setWordCountTarget,
  setCurrentVersion,
  resetProject,
} = projectSlice.actions;

export default projectSlice.reducer;
