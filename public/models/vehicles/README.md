# Vehicle 3D assets

The current traffic renderer no longer uses the previous Kenney / compact low-poly vehicle files.

## Active vehicle model

TEACH ELETRICY currently uses the **Car Concept** model from KhronosGroup's glTF Sample Assets as the primary traffic vehicle.

Source:
https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept

The asset is loaded at runtime from the upstream GLB and is not vendored in this folder.

License: Creative Commons Attribution 4.0 (CC BY 4.0).

The upstream model includes detailed automotive geometry and PBR materials, including clearcoat, glass transmission, interior components, wheels, headlights and brake-light materials.

Original model credits and license details are documented by Khronos in the source repository.

TEACH ELETRICY only applies runtime paint-color variation, brake-light intensity, scale normalization, shadows, and traffic behavior.
