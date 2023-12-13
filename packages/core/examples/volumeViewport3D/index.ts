// Load the rendering pieces we want to use (for both WebGL and WebGPU)
//import '@kitware/vtk.js/favicon';

import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import '@kitware/vtk.js/Rendering/Profiles/Glyph';
import vtkImplicitPlaneWidget from '@kitware/vtk.js/Widgets/Widgets3D/ImplicitPlaneWidget';
import vtkWidgetManager from '@kitware/vtk.js/Widgets/Core/WidgetManager';
import vtkImageCroppingWidget from '@kitware/vtk.js/Widgets/Widgets3D/ImageCroppingWidget';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

import { initializeCropping, hookVolumeActor } from './croppingFunctions';

import {
  cache,
  CONSTANTS,
  Enums,
  RenderingEngine,
  setVolumesForViewports,
  Types,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addDropdownToToolbar,
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  ZoomTool,
  TrackballRotateTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;
const { transformWorldToIndex } = utilities;

// Define a unique id for the volume
let renderingEngine;
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const renderingEngineId = 'myRenderingEngine';
const viewportId = '3D_VIEWPORT';
const overlay = document.createElement('div');

// ======== Set up page ======== //
setTitleAndDescription(
  '3D Volume Rendering',
  'Here we demonstrate how to 3D render a volume.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
element1.oncontextmenu = () => false;

element1.style.width = size;
element1.style.height = size;

viewportGrid.appendChild(element1);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = 'Click the image to rotate it.';

content.append(instructions);

addDropdownToToolbar({
  options: {
    values: CONSTANTS.VIEWPORT_PRESETS.map((preset) => preset.name),
    defaultValue: 'CT-Bone',
  },
  onSelectedValueChange: (presetName) => {
    const volumeActor = renderingEngine
      .getViewport(viewportId)
      .getDefaultActor().actor as Types.VolumeActor;

    utilities.applyPreset(
      volumeActor,
      CONSTANTS.VIEWPORT_PRESETS.find((preset) => preset.name === presetName)
    );

    renderingEngine.render();
  },
});

function setupOverlay() {
  const overlaySize = 15;
  const overlayBorder = 2;
  overlay.style.position = 'absolute';
  overlay.style.width = `${overlaySize}px`;
  overlay.style.height = `${overlaySize}px`;
  overlay.style.border = `solid ${overlayBorder}px red`;
  overlay.style.borderRadius = '50%';
  overlay.style.left = '-100px';
  overlay.style.pointerEvents = 'none';
  document.querySelector('body').appendChild(overlay);
}

export function createSphereActor(
  point: number[],
  radius = 7.0,
  color = [0.0, 1.0, 0.0]
): vtkActor {
  const sphere = vtkSphereSource.newInstance();
  sphere.setCenter(point[0], point[1], point[2]);
  sphere.setRadius(radius);
  const sphereMapper = vtkMapper.newInstance();
  sphereMapper.setInputConnection(sphere.getOutputPort());
  const sphereActor = vtkActor.newInstance();
  sphereActor.setMapper(sphereMapper);
  sphereActor.getProperty().setColor(color);
  return sphereActor;
}

// ============================= //
addButtonToToolbar({
  title: 'Get world coordinates',
  onClick: async () => {
    const viewport = renderingEngine.getViewport(viewportId);
    const imageVolume = cache.getVolume(viewport.getDefaultActor().uid);
    const world = imageVolume.imageData.indexToWorld([0, 256, 512]);

    const renderer = viewport.getRenderer();

    const sphere = createSphereActor(world as number[]);
    renderer.addActor(sphere);

    const sphere2 = createSphereActor([-124.755859375, -366.255859375, -375.6]);
    renderer.addActor(sphere2);
    renderingEngine.render();

    // const volumeActor = viewport.getDefaultActor().actor as Types.VolumeActor;
    // const imageData = volumeActor.getMapper().getInputData();
    // const world1 = imageData.imageData.indexToWorld([0, 256, 512]);
    // alert(world1);
  },
});

addButtonToToolbar({
  title: 'Reset Clipping Range',
  onClick: async () => {
    const viewport = renderingEngine.getViewport(viewportId);
    viewport.resetVolumeViewportClippingRange();
    renderingEngine.render();
  },
});

addButtonToToolbar({
  title: 'Add crop widget',
  onClick: async () => {
    const viewport = renderingEngine.getViewport(viewportId);
    const renderer = viewport.getRenderer();
    const renderWindow = viewport
      .getRenderingEngine()
      .offscreenMultiRenderWindow.getRenderWindow();

    const volumeActor = viewport.getDefaultActor().actor as Types.VolumeActor;

    setupOverlay();
    const { widgetManager, widget } = initializeCropping(
      renderer,
      renderWindow,
      overlay
    );
    renderingEngine.render();
    hookVolumeActor(widget, volumeActor, renderer, renderWindow);
    viewport.resetVolumeViewportClippingRange();
    renderingEngine.render();
    renderer.resetCameraClippingRange();

    widget.set({ faceHandlesEnabled: true });
    widget.set({ edgeHandlesEnabled: true });
    widget.set({ cornerHandlesEnabled: true });

    renderingEngine.render();
  },
});

addButtonToToolbar({
  title: 'Add widget',
  onClick: async () => {
    const widgetManager = vtkWidgetManager.newInstance();
    const viewport = renderingEngine.getViewport(viewportId);
    const renderer = viewport.getRenderer();
    widgetManager.setRenderer(renderer);
    const widget = vtkImplicitPlaneWidget.newInstance();
    widget.getWidgetState().setNormal(0, 0, 1);
    widget.placeWidget([-100, 100, -100, 20, -200, 0]);
    widget.setPlaceFactor(3);
    widgetManager.addWidget(widget);
    renderer.resetCamera();
    widgetManager.enablePicking();
    viewport.render();
    window._widget = widget;
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroupId = 'TOOL_GROUP_ID';

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(TrackballRotateTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group and specify which volume they are pointing at
  toolGroup.addTool(TrackballRotateTool.toolName, {
    configuration: { volumeId },
  });
  toolGroup.addTool(ZoomTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(TrackballRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Left Click
      },
    ],
  });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1706.8374.643249677828306008300337414785',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1706.8374.353297340939839941169758740949',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
    // StudyInstanceUID: '6.5019.7618.265578196.4759',
    // SeriesInstanceUID:
    //   '1.3.12.2.1107.5.1.4.73030.30000019022606105951500003381',
    // wadoRsRoot: 'http://localhost/dicom-web',
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports

  const viewportInputArray = [
    {
      viewportId: viewportId,
      type: ViewportType.VOLUME_3D,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewports
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId]).then(
    () => {
      const volumeActor = renderingEngine
        .getViewport(viewportId)
        .getDefaultActor().actor as Types.VolumeActor;

      utilities.applyPreset(
        volumeActor,
        CONSTANTS.VIEWPORT_PRESETS.find((preset) => preset.name === 'CT-Bone')
      );

      viewport.render();
    }
  );

  const viewport = renderingEngine.getViewport(viewportId);
  renderingEngine.render();
}

run();
