// Pure reducer driving the editor page. Kept free of React/API concerns so it can be
// unit-tested in isolation and so the Edit page can dispatch from anywhere (autosave,
// section forms, keyboard shortcuts) without the reducer needing to know about them.
import { nanoid } from 'nanoid';
import { defaultDataFor } from '@shared/section-types.js';

// Short ids are enough: they only need to be unique within one resume's sections array.
const newId = () => nanoid(12);

export const initialState = { resume: null, etag: null, dirty: false };

// Action creators bundled as an object — simpler to import `actions` once from the
// Edit page than to sprinkle individual imports across every form component.
export const actions = {
  hydrate:           ({ resume, etag }) =>   ({ type: 'hydrate', resume, etag }),
  saved:             (etag) =>               ({ type: 'saved', etag }),
  updateScalar:      (patch) =>              ({ type: 'updateScalar', patch }),
  addSection:        ({ type }) =>           ({ type: 'addSection', sectionType: type }),
  removeSection:     ({ id }) =>             ({ type: 'removeSection', id }),
  moveSection:       ({ id, direction }) =>  ({ type: 'moveSection', id, direction }),
  updateSection:     ({ id, patch }) =>      ({ type: 'updateSection', id, patch }),
  updateSectionData: ({ id, data }) =>       ({ type: 'updateSectionData', id, data }),
  setPhotoKey:       (photoKey) =>           ({ type: 'setPhotoKey', photoKey }),
};

// WHY a helper: swap-in-place is easy to get wrong when you mutate; building a fresh
// array keeps the reducer's immutability contract obvious at every call site.
const moveIn = (arr, id, direction) => {
  const i = arr.findIndex((x) => x.id === id);
  if (i < 0) return arr;
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= arr.length) return arr;
  const out = arr.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

export const reducer = (state, action) => {
  switch (action.type) {
    case 'hydrate':
      // Fresh load from the server — any local dirty state is obsolete.
      return { resume: action.resume, etag: action.etag, dirty: false };
    case 'saved':
      // Server accepted a PUT; keep the locally-edited resume but rotate the etag
      // and flip dirty off so autosave pauses until the next edit.
      return { ...state, etag: action.etag, dirty: false };
    case 'updateScalar':
      return { ...state, resume: { ...state.resume, ...action.patch }, dirty: true };
    case 'addSection': {
      const section = {
        id: newId(),
        type: action.sectionType,
        pageBreakBefore: false,
        data: defaultDataFor(action.sectionType),
      };
      return {
        ...state,
        resume: { ...state.resume, sections: [...state.resume.sections, section] },
        dirty: true,
      };
    }
    case 'removeSection':
      return {
        ...state,
        resume: {
          ...state.resume,
          sections: state.resume.sections.filter((s) => s.id !== action.id),
        },
        dirty: true,
      };
    case 'moveSection':
      return {
        ...state,
        resume: {
          ...state.resume,
          sections: moveIn(state.resume.sections, action.id, action.direction),
        },
        dirty: true,
      };
    case 'updateSection':
      return {
        ...state,
        resume: {
          ...state.resume,
          sections: state.resume.sections.map((s) => (
            s.id === action.id ? { ...s, ...action.patch } : s
          )),
        },
        dirty: true,
      };
    case 'updateSectionData':
      return {
        ...state,
        resume: {
          ...state.resume,
          sections: state.resume.sections.map((s) => (
            s.id === action.id ? { ...s, data: action.data } : s
          )),
        },
        dirty: true,
      };
    case 'setPhotoKey':
      return {
        ...state,
        resume: { ...state.resume, photoKey: action.photoKey },
        dirty: true,
      };
    default:
      return state;
  }
};
