// Load the rendering pieces we want to use (for both WebGL and WebGPU)
//import '@kitware/vtk.js/favicon';
import { getEnabledElement } from '@cornerstonejs/core';
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import '@kitware/vtk.js/Rendering/Profiles/Glyph';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';

import { FieldAssociations } from '@kitware/vtk.js/Common/DataModel/DataSet/Constants';
import { initializeCropping, updateClippingPlanes } from './croppingFunctions';

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

// Define a unique id for the volume
let renderingEngine;
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const renderingEngineId = 'myRenderingEngine';
const viewportId = '3D_VIEWPORT';
let widget;

let hardwareSelector;
const picker = vtkCellPicker.newInstance();
picker.setPickFromList(0);

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

function configureSelector() {
  const viewport = renderingEngine.getViewport(viewportId);
  const renderer = viewport.getRenderer();
  renderer.setDraw(true);
  const renderWindow = renderer.getRenderWindow();
  const interactor = renderWindow.getInteractor();
  const apiSpecificRenderWindow = interactor.getView();
  hardwareSelector = apiSpecificRenderWindow.getSelector();
  hardwareSelector.setCaptureZValues(true);
  hardwareSelector.setFieldAssociation(
    FieldAssociations.FIELD_ASSOCIATION_CELLS
  );
}

function bindEvents() {
  const viewport = renderingEngine.getViewport(viewportId);
  const offscreenMultiRenderWindow =
    viewport.getRenderingEngine().offscreenMultiRenderWindow;
  offscreenMultiRenderWindow.getInteractor().bindEvents(element1);
}

async function addCropWidget() {
  const viewport = renderingEngine.getViewport(viewportId);
  const renderer = viewport.getRenderer();
  const renderWindow = viewport
    .getRenderingEngine()
    .offscreenMultiRenderWindow.getRenderWindow();

  const volumeActor = viewport.getDefaultActor().actor as Types.VolumeActor;

  const {
    widgetManager,
    widget: createdWidget,
    viewWidget,
  } = initializeCropping(viewport);
  renderingEngine.render();
  renderer.resetCameraClippingRange();

  widget = createdWidget;
  widget.set({
    faceHandlesEnabled: true,
    edgeHandlesEnabled: false,
    cornerHandlesEnabled: false,
  });

  await renderingEngine.render();
  await viewport.resetVolumeViewportClippingRange();
}

// ============================= //
addButtonToToolbar({
  title: 'Add hardware picker',
  onClick: async () => {
    //configureSelector();
    const viewport = renderingEngine.getViewport(viewportId);
    const renderer = viewport.getRenderer();
    renderer.setDraw(true);
  },
});

addButtonToToolbar({
  title: 'Update Actor',
  onClick: async () => {
    // const renderer = viewport.getRenderer();
    // const imageVolume = cache.getVolume(viewport.getDefaultActor().uid);

    // const midX = imageVolume.dimensions[0] / 2;
    // const midY = imageVolume.dimensions[1] / 2;
    // const midZ = imageVolume.dimensions[2] / 2;

    // let world = imageVolume.imageData.indexToWorld([midX, midY, 0]);
    // let sphere = createSphereActor(world as number[]);
    // renderer.addActor(sphere);

    // world = imageVolume.imageData.indexToWorld([midX, midY, midZ * 2]);
    // sphere = createSphereActor(world as number[]);
    // renderer.addActor(sphere);

    const viewport = renderingEngine.getViewport(viewportId);
    if (!viewport?.updateRotation) {
      viewport.updateRotation = () => {
        const cropState = widget.getWidgetState().getCroppingPlanes();
        updateClippingPlanes(viewport, cropState.getPlanes());
      };
    }
  },
});

addButtonToToolbar({
  title: 'Bind Events',
  onClick: async () => {
    bindEvents();
  },
});

addButtonToToolbar({
  title: 'Add crop widget',
  onClick: async () => {
    addCropWidget();
  },
});

function mouseDown(evt) {
  const element = evt.currentTarget;
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement as Types.IEnabledElement;
  const canvasCoords = [evt.offsetX, evt.offsetY];
  const position = convertCanvasToVTK(element, canvasCoords);
  const renderer = viewport.getRenderer();
  renderer.setDraw(true);
  if (false) {
    picker.pick(position, renderer);
    if (picker.getActors().length) {
      console.log('Got an actor (Picker)');
    }
  } else if (hardwareSelector) {
    hardwareSelector
      .getSourceDataAsync(
        renderer,
        position[0],
        position[1],
        position[0],
        position[1]
      )
      .then((result) => {
        if (result) {
          const selection = result.generateSelection(
            position[0],
            position[1],
            position[0],
            position[1]
          );
          if (selection.length > 0) {
            console.log('Got an actor (hardware Selector)');
          }
        }
      });
  }
}

/**
 * Convert canvas coordinates to VTK screen coordinates
 * @param evt mouse event information
 * @returns VTKCoords vtk converted coordinate
 */
function convertCanvasToVTK(element, canvasCoords) {
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement as Types.IEnabledElement;

  const renderWindow = viewport
    .getRenderingEngine()
    .offscreenMultiRenderWindow.getRenderWindow();

  const bounds = element.getBoundingClientRect();
  const [canvasWidth, canvasHeight] = renderWindow.getViews()[0].getSize();
  // get the rectangle coordinates [x1, y1, x2, y2] of the current 3D scenario view.
  // The coordinates are percentages of the size of the view [canvasWidth, canvasHeight]
  // i.e. [0.25, 0, 1, 1] -> [0.25 * canvasWidth, 0, canvasWidth, canvasHeight]
  const viewport3D = viewport.getRenderer().getViewport();
  const offset = [canvasWidth * viewport3D[0], canvasHeight * viewport3D[1]];

  const position = [
    canvasCoords[0] + offset[0],
    bounds.height - (canvasCoords[1] + offset[1]),
    0,
  ];
  return position;
}

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
        mouseButton: MouseBindings.Auxiliary, // Left Click
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
      //'1.3.6.1.4.1.14519.5.2.1.1706.8374.643249677828306008300337414785',
      //'1.3.6.1.4.1.25403.345050719074.3824.20170125095258.1',
      '2.16.840.1.114362.1.11972228.22789312658.616067305.306.2',
    SeriesInstanceUID:
      //'1.3.6.1.4.1.14519.5.2.1.1706.8374.353297340939839941169758740949',
      //'1.3.6.1.4.1.25403.345050719074.3824.20170125095258.7',
      '2.16.840.1.114362.1.11972228.22789312658.616067305.306.3',
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
  //element1.addEventListener('mousedown', mouseDown);
}

run();
