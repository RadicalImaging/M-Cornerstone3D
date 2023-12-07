import { mat4 } from 'gl-matrix';
import { addProvider } from '../metaData';

const state = {};
const viewportIdSeriesMapping = {};

/**
 * Simple metadataProvider object to store metadata for spatial registration module.
 */
const spatialRegistrationMetadataProvider = {
  /* Adding a new entry to the state object. */
  add: (query: string[], payload: mat4): void => {
    const [viewportId1, viewportId2, seriesInstanceUID1, seriesInstanceUID2] =
      query;
    const entryId = `${viewportId1}_${viewportId2}`;

    if (!state[entryId]) {
      state[entryId] = {};
    }

    state[entryId] = payload;
    viewportIdSeriesMapping[viewportId1] = seriesInstanceUID1;
    viewportIdSeriesMapping[viewportId2] = seriesInstanceUID2;
  },

  get: (type: string, query: string[]): mat4 => {
    if (type !== 'spatialRegistrationModule') {
      return;
    }

    const [viewportId1, viewportId2, seriesInstanceUID1, seriesInstanceUID2] =
      query;

    // checks if the seriesInstanceUID from the viewports didn't change
    if (
      viewportIdSeriesMapping[viewportId1] !== seriesInstanceUID1 &&
      viewportIdSeriesMapping[viewportId2] !== seriesInstanceUID2
    ) {
      return;
    }

    // check both ways
    const entryId = `${viewportId1}_${viewportId2}`;

    if (state[entryId]) {
      return state[entryId];
    }

    const entryIdReverse = `${viewportId2}_${viewportId1}`;

    if (state[entryIdReverse]) {
      return mat4.invert(mat4.create(), state[entryIdReverse]);
    }
  },

  clear: () => {
    for (const key in state) {
      delete state[key];
    }

    for (const key in viewportIdSeriesMapping) {
      delete viewportIdSeriesMapping[key];
    }
  },
};

addProvider(
  spatialRegistrationMetadataProvider.get.bind(
    spatialRegistrationMetadataProvider
  )
);

export default spatialRegistrationMetadataProvider;
