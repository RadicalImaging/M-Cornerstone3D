import { vec3, quat, mat4 } from 'gl-matrix';
import vtkWidgetManager from '@kitware/vtk.js/Widgets/Core/WidgetManager';
import vtkImageCroppingWidget from '@kitware/vtk.js/Widgets/Widgets3D/ImageCroppingWidget';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

const overlaySize = 15;
const overlayBorder = 2;
let overlay;

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

export function getCroppingPlanes(viewport, imageData, ijkPlanes) {
  let transform;
  if (viewport?.lastTransformation) {
    transform = viewport.lastTransformation;
  } else {
    transform = mat4.identity(new Float32Array(16));
  }

  const rotation = quat.create();
  mat4.getRotation(rotation, imageData.getIndexToWorld());

  const rotateVec = (vec) => {
    const out = [0, 0, 0];
    vec3.transformQuat(out, vec, rotation);
    return out;
  };

  const rotateNormal = (vec) => {
    const out = [0, 0, 0];
    vec3.transformMat4(out, vec, transform);
    return out;
  };

  const [iMin, iMax, jMin, jMax, kMin, kMax] = ijkPlanes;
  const xMiddle = (iMax - iMin) / 2;
  const yMiddle = (jMax - jMin) / 2;
  const zMiddle = (kMax - kMin) / 2;

  const planeMiddlePoints = [
    rotateNormal(imageData.indexToWorld([iMin, yMiddle, zMiddle])),
    rotateNormal(imageData.indexToWorld([iMax, yMiddle, zMiddle])),
    rotateNormal(imageData.indexToWorld([xMiddle, jMin, zMiddle])),
    rotateNormal(imageData.indexToWorld([xMiddle, jMax, zMiddle])),
    rotateNormal(imageData.indexToWorld([xMiddle, yMiddle, kMin])),
    rotateNormal(imageData.indexToWorld([xMiddle, yMiddle, kMax])),
  ];

  return [
    // X min/max
    vtkPlane.newInstance({
      normal: rotateVec([1, 0, 0]),
      origin: planeMiddlePoints[0],
    }),
    vtkPlane.newInstance({
      normal: rotateVec([-1, 0, 0]),
      origin: planeMiddlePoints[1],
    }),
    // Y min/max
    vtkPlane.newInstance({
      normal: rotateVec([0, 1, 0]),
      origin: planeMiddlePoints[2],
    }),
    vtkPlane.newInstance({
      normal: rotateVec([0, -1, 0]),
      origin: planeMiddlePoints[3],
    }),
    // X min/max
    vtkPlane.newInstance({
      normal: rotateVec([0, 0, 1]),
      origin: planeMiddlePoints[4],
    }),
    vtkPlane.newInstance({
      normal: rotateVec([0, 0, -1]),
      origin: planeMiddlePoints[5],
    }),
  ];
}

export function updateClippingPlanes(viewport, givenPlanes = []) {
  const renderer = viewport.getRenderer();
  const renderWindow = viewport
    .getRenderingEngine()
    .offscreenMultiRenderWindow.getRenderWindow();
  const volumeActor = viewport.getDefaultActor().actor;
  const mapper = volumeActor.getMapper();
  const image = mapper.getInputData();
  const planes = getCroppingPlanes(viewport, image, givenPlanes);
  mapper.removeAllClippingPlanes();
  planes.forEach((plane) => {
    mapper.addClippingPlane(plane);
  });
  mapper.modified();
  renderWindow.render();
  setTimeout(() => {
    viewport.render();
    setTimeout(() => {
      renderer.setDraw(true);
    }, 0);
  }, 0);
}

export function hookVolumeActor(widget, viewport) {
  const renderWindow = viewport
    .getRenderingEngine()
    .offscreenMultiRenderWindow.getRenderWindow();
  const volumeActor = viewport.getDefaultActor().actor;
  const mapper = volumeActor.getMapper();
  const image = mapper.getInputData();
  widget.copyImageDataDescription(image);
  const cropState = widget.getWidgetState().getCroppingPlanes();
  cropState.onModified(() => {
    updateClippingPlanes(viewport, cropState.getPlanes());
  });

  mapper.removeAllClippingPlanes();
  renderWindow.render();
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
    renderer.setDraw(true);
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
    renderWindow.render();
  }
  widgetRegistration();
  const viewWidget = widgetManager['addWidget'](widget);
  viewWidget.setScaleInPixels(false);

  hookVolumeActor(widget, viewport);

  return { widgetManager, widget, viewWidget };
}
