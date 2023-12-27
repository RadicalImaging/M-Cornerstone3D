// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import '@kitware/vtk.js/Rendering/Profiles/Glyph';

import { vec3, quat, mat4 } from 'gl-matrix';
import { Enums } from '@cornerstonejs/core';
import vtkWidgetManager from '@kitware/vtk.js/Widgets/Core/WidgetManager';
import vtkImageCroppingWidget from '@kitware/vtk.js/Widgets/Widgets3D/ImageCroppingWidget';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import { Vector3 } from '@kitware/vtk.js/types';
import getRenderingEngine from '../../src/RenderingEngine/getRenderingEngine';

const overlaySize = 15;
const overlayBorder = 2;
let overlay;

export function bindEvents(viewport) {
  const offscreenMultiRenderWindow =
    viewport.getRenderingEngine().offscreenMultiRenderWindow;
  offscreenMultiRenderWindow.getInteractor().bindEvents(viewport.element);
}

export function setupOverlay() {
  overlay = document.createElement('div');
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

export function getCroppingPlanes(imageData, ijkPlanes) {
  if (!ijkPlanes?.length) {
    return [];
  }
  const rotation = quat.create();
  mat4.getRotation(rotation, imageData.getIndexToWorld());

  function rotateNormal(vec): Vector3 {
    const out = [0, 0, 0] as vec3;
    vec3.transformQuat(out, vec, rotation);
    return out as Vector3;
  }

  const [iMin, iMax, jMin, jMax, kMin, kMax] = ijkPlanes;
  const xMiddle = (iMax - iMin) / 2;
  const yMiddle = (jMax - jMin) / 2;
  const zMiddle = (kMax - kMin) / 2;

  const planeMiddlePoints = [
    imageData.indexToWorld([iMin, yMiddle, zMiddle]),
    imageData.indexToWorld([iMax, yMiddle, zMiddle]),
    imageData.indexToWorld([xMiddle, jMin, zMiddle]),
    imageData.indexToWorld([xMiddle, jMax, zMiddle]),
    imageData.indexToWorld([xMiddle, yMiddle, kMin]),
    imageData.indexToWorld([xMiddle, yMiddle, kMax]),
  ];

  return [
    // X min/max
    vtkPlane.newInstance({
      normal: rotateNormal([1, 0, 0]),
      origin: planeMiddlePoints[0],
    }),
    vtkPlane.newInstance({
      normal: rotateNormal([-1, 0, 0]),
      origin: planeMiddlePoints[1],
    }),
    // Y min/max
    vtkPlane.newInstance({
      normal: rotateNormal([0, 1, 0]),
      origin: planeMiddlePoints[2],
    }),
    vtkPlane.newInstance({
      normal: rotateNormal([0, -1, 0]),
      origin: planeMiddlePoints[3],
    }),
    // X min/max
    vtkPlane.newInstance({
      normal: rotateNormal([0, 0, 1]),
      origin: planeMiddlePoints[4],
    }),
    vtkPlane.newInstance({
      normal: rotateNormal([0, 0, -1]),
      origin: planeMiddlePoints[5],
    }),
  ];
}

export function updateCroppingPlanes(viewport, givenPlanes = []) {
  const volumeActor = viewport.getDefaultActor().actor;
  const mapper = volumeActor.getMapper();
  const image = mapper.getInputData();
  const planes = getCroppingPlanes(image, givenPlanes);
  mapper.removeAllClippingPlanes();
  planes.forEach((plane) => {
    mapper.addClippingPlane(plane);
  });
  mapper.modified();
}

export function hookVolumeActor(widget, viewport) {
  const renderer = viewport.getRenderer();
  const volumeActor = viewport.getDefaultActor().actor;
  const mapper = volumeActor.getMapper();
  const image = mapper.getInputData();
  widget.copyImageDataDescription(image);
  const cropState = widget.getWidgetState().getCroppingPlanes();
  cropState.onModified(() => {
    updateCroppingPlanes(viewport, cropState.getPlanes());
  });

  mapper.removeAllClippingPlanes();
  // whenever the mapper is modified, as changing the clipping planes,
  // this function will occurs
  mapper.onModified(() => {
    setTimeout(() => {
      viewport.render();
    }, 0);
  });
  widget.set({ visibility: true });
}

export function initializeCropping(viewport) {
  const renderer = viewport.getRenderer();
  const renderWindow = viewport
    .getRenderingEngine()
    .offscreenMultiRenderWindow.getRenderWindow();
  setupOverlay();
  const widgetManager = vtkWidgetManager.newInstance();
  widgetManager.setRenderer(renderer);
  const interactor = renderWindow.getInteractor();
  const apiSpecificRenderWindow = interactor.getView();

  const widget = vtkImageCroppingWidget.newInstance();

  function widgetRegistration(e = undefined) {
    const action = e ? e.currentTarget.dataset.action : 'addWidget';
    const viewWidget = widgetManager[action](widget);
    if (viewWidget) {
      viewWidget.setDisplayCallback((coords) => {
        overlay.style.left = '-100px';
        if (coords) {
          const [w, h] = apiSpecificRenderWindow.getSize();
          overlay.style.left = `${Math.round(
            (coords[0][0] / w) * window.innerWidth -
              overlaySize * 0.5 -
              overlayBorder
          )}px`;
          overlay.style.top = `${Math.round(
            ((h - coords[0][1]) / h) * window.innerHeight -
              overlaySize * 0.5 -
              overlayBorder
          )}px`;
        }
      });
    }
    widgetManager.enablePicking();
  }
  widgetRegistration();
  const viewWidget = widgetManager['addWidget'](widget);
  viewWidget.setScaleInPixels(false);

  hookVolumeActor(widget, viewport);

  // This function updates the clipping planes in case the camera changes
  viewport.element.addEventListener(Enums.Events.CAMERA_MODIFIED, () => {
    const cropState = widget.getWidgetState().getCroppingPlanes();
    updateCroppingPlanes(viewport, cropState.getPlanes());
  });

  widget.set({
    faceHandlesEnabled: true,
    edgeHandlesEnabled: true,
    cornerHandlesEnabled: true,
  });

  viewport.resetVolumeViewportClippingRange();
  bindEvents(viewport);

  const renderingEngine = viewport.getRenderingEngine();
  renderingEngine.changeContinuousDrawingState(true);
  viewport.render();
  return { widgetManager, widget, viewWidget };
}
