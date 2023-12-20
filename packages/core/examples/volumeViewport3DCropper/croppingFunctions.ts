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

export function getCroppingPlanes(imageData, ijkPlanes) {
  const rotation = quat.create();
  mat4.getRotation(rotation, imageData.getIndexToWorld());

  const rotateVec = (vec) => {
    const out = [0, 0, 0];
    vec3.transformQuat(out, vec, rotation);
    return out;
  };

  const [iMin, iMax, jMin, jMax, kMin, kMax] = ijkPlanes;
  const origin = imageData.indexToWorld([iMin, jMin, kMin]);
  // opposite corner from origin
  const corner = imageData.indexToWorld([iMax, jMax, kMax]);
  return [
    // X min/max
    vtkPlane.newInstance({ normal: rotateVec([1, 0, 0]), origin }),
    vtkPlane.newInstance({ normal: rotateVec([-1, 0, 0]), origin: corner }),
    // Y min/max
    vtkPlane.newInstance({ normal: rotateVec([0, 1, 0]), origin }),
    vtkPlane.newInstance({ normal: rotateVec([0, -1, 0]), origin: corner }),
    // X min/max
    vtkPlane.newInstance({ normal: rotateVec([0, 0, 1]), origin }),
    vtkPlane.newInstance({ normal: rotateVec([0, 0, -1]), origin: corner }),
  ];
}

export function hookVolumeActor(widget, volumeActor, renderer, renderWindow) {
  const mapper = volumeActor.getMapper();
  const image = mapper.getInputData();
  widget.copyImageDataDescription(image);
  const cropState = widget.getWidgetState().getCroppingPlanes();
  cropState.onModified(() => {
    const planes = getCroppingPlanes(image, cropState.getPlanes());
    mapper.removeAllClippingPlanes();
    planes.forEach((plane) => {
      mapper.addClippingPlane(plane);
    });
    mapper.modified();
  });

  mapper.removeAllClippingPlanes();
  renderWindow.render();
  widget.set({ visibility: true });
}

export function initializeCropping(renderer, renderWindow, volumeActor) {
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

      renderer.resetCamera();
      renderer.resetCameraClippingRange();
    }
    widgetManager.enablePicking();
    renderWindow.render();
    return { widgetManager, widget };
  }
  widgetRegistration();
  const viewWidget = widgetManager['addWidget'](widget);
  viewWidget.setScaleInPixels(false);

  hookVolumeActor(widget, volumeActor, renderer, renderWindow);

  return { widgetManager, widget, viewWidget };
}
