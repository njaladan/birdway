"""Blender 4.3+: blender -b assets/pigeon/source.blend --python tools/prepare-pigeon.py
CC0 mujtaba-io mesh/rig. Add coloring and complete gameplay clips; export one
skinned mesh, without the source's unrelated references or unused prototypes.
"""
import bpy, math, pathlib
from mathutils import Vector, Quaternion
root=pathlib.Path(__file__).resolve().parent.parent
for o in list(bpy.data.objects):
 if o.name not in ['pigeon-model','pigeon-armature']:bpy.data.objects.remove(o,do_unlink=True)
rig=bpy.data.objects['pigeon-armature'];model=bpy.data.objects['pigeon-model']
original={a.name:a for a in bpy.data.actions}
rig.animation_data_clear();model.animation_data_clear()
for b in rig.pose.bones:b.rotation_quaternion=(1,0,0,0)
# One subdivision smooths the old low-poly silhouette while retaining the rig.
bpy.context.view_layer.objects.active=model;model.select_set(True)
sub=model.modifiers.new('Silhouette smoothing','SUBSURF');sub.levels=1
bpy.ops.object.modifier_move_up(modifier=sub.name);bpy.ops.object.modifier_apply(modifier=sub.name)
for p in model.data.polygons:p.use_smooth=True
mat=bpy.data.materials.new('Pigeon plumage');mat.use_nodes=True
nodes=mat.node_tree.nodes;bsdf=nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.72
colorNode=nodes.new('ShaderNodeVertexColor');colorNode.layer_name='Plumage';mat.node_tree.links.new(colorNode.outputs['Color'],bsdf.inputs['Base Color'])
model.data.materials.clear();model.data.materials.append(mat)
def linear(rgb):return tuple(v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)
def paint(obj,fn):
 for a in list(obj.data.color_attributes):obj.data.color_attributes.remove(a)
 colors=obj.data.color_attributes.new(name='Plumage',type='FLOAT_COLOR',domain='CORNER');obj.data.color_attributes.active_color=colors
 for loop in obj.data.loops:colors.data[loop.index].color=linear(fn(obj.data.vertices[loop.vertex_index]))
def plumage(v):
 x,y,z=v.co;weights={model.vertex_groups[g.group].name:g.weight for g in v.groups};dominant=max(weights,key=weights.get,default='')
 if 'leg' in dominant:return (.63,.34,.32)
 if y>.137 and z>.17:return (.48,.47,.43) # beak / white cere
 if 'wing' in dominant:
  a=abs(x);band=(.085<a<.106 or .132<a<.154) and y<.018
  return (.20,.24,.29) if band or a>.205 else (.48,.53,.58)
 if 'tail' in dominant:return (.24,.29,.34)
 if z>.205:return (.29,.34,.40)
 if y>.045 and z>.135:
  return (.25,.43,.36) if x<0 else (.38,.32,.46)
 shade=.49+.08*max(-1,min(1,z/.15));return (shade*.92,shade,shade*1.08)
paint(model,plumage)
# Eyes are weighted to the existing head bone and joined into the same mesh.
extras=[]
for side in [-1,1]:
 for name,pos,rgb,scale in [
  ('amber iris',(side*.027,.106,.226),(.86,.48,.13),(.0045,.0045,.0045)),
  ('pupil',(side*.0304,.1068,.2265),(.035,.045,.055),(.0024,.0024,.0024)),
  ('catchlight',(side*.032,.108,.228),(.92,.96,1),(.0008,.0008,.0008))]:
  bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,location=pos);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=True,rotation=False,scale=True)
  o.data.materials.clear();o.data.materials.append(mat);paint(o,lambda v,rgb=rgb:rgb)
  for p in o.data.polygons:p.use_smooth=True
  group=o.vertex_groups.new(name='face-bone');group.add(list(range(len(o.data.vertices))),1,'REPLACE');extras.append(o)
bpy.ops.object.select_all(action='DESELECT');model.select_set(True)
for o in extras:o.select_set(True)
bpy.context.view_layer.objects.active=model;bpy.ops.object.join()
# All polygons use the same vertex-color material => one draw call per pigeon.
model.data.materials.clear();model.data.materials.append(mat)
for p in model.data.polygons:p.material_index=0
rig.animation_data_create();clips=[]
def reset():
 for b in rig.pose.bones:b.rotation_mode='QUATERNION';b.rotation_quaternion=(1,0,0,0);b.location=(0,0,0);b.scale=(1,1,1)
def sample(action,frame):
 reset();rig.animation_data.action=action;bpy.context.scene.frame_set(frame)
 return {b.name:b.rotation_quaternion.copy() for b in rig.pose.bones}
flightSamples=[sample(original['flap-wings-animation'],i) for i in range(25)]
idleSamples=[sample(original['idle-animation'],i%12) for i in range(49)]
legPose=sample(original['legs-up-animation'],4)
for action in original.values():bpy.data.actions.remove(action)
for name,frames in [('Flight',24),('Idle',48),('Walk',24),('Peck',24)]:
 action=bpy.data.actions.new(name);clips.append(action);reset();rig.animation_data.action=action
 for frame in range(frames+1):
  t=frame/frames;reset()
  poses=flightSamples[frame] if name=='Flight' else idleSamples[frame]
  for bone,q in poses.items():rig.pose.bones[bone].rotation_quaternion=q
  if name=='Flight':
   for b in rig.pose.bones:
    if 'leg' in b.name:b.rotation_quaternion=legPose[b.name]
  else:
   for side,s in [('left',1),('right',-1)]:
    # Turn the spread wings back along the tail and fold their outer joints.
    for joint,angle in [(1,1.3),(2,.32)]:
     b=rig.pose.bones[f'{side}-wing-{joint}'];axis=b.bone.matrix_local.to_3x3().inverted()@Vector((0,0,1));b.rotation_quaternion=Quaternion(axis,s*angle)
   if name=='Walk':
    for side,s in [('left',1),('right',-1)]:
     b=rig.pose.bones[f'{side}-upper-leg-bone'];b.rotation_quaternion=Quaternion((1,0,0),math.sin(t*math.tau)*s*.33)
     b=rig.pose.bones[f'{side}-lower-leg-bone'];b.rotation_quaternion=Quaternion((1,0,0),max(0,math.sin(t*math.tau)*s)*.28)
    rig.pose.bones['neck-bone'].rotation_quaternion=Quaternion((1,0,0),math.sin(t*math.tau*2)*.08)
   if name=='Peck':
    bend=math.sin(t*math.pi)**2
    rig.pose.bones['thorax-bone'].rotation_quaternion=Quaternion((1,0,0),-bend*.5)
    rig.pose.bones['neck-bone'].rotation_quaternion=Quaternion((1,0,0),-bend*.65)
    rig.pose.bones['face-bone'].rotation_quaternion=Quaternion((1,0,0),-bend*.3)
  for b in rig.pose.bones:b.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=b.name)
 for curve in action.fcurves:
  for k in curve.keyframe_points:k.interpolation='LINEAR'
rig.animation_data.action=clips[1];bpy.context.scene.frame_set(0)
# NLA tracks preserve clip names, exporting only these four complete states.
for clip in clips:
 track=rig.animation_data.nla_tracks.new();track.name=clip.name;strip=track.strips.new(clip.name,0,clip);strip.action_frame_start=0;strip.action_frame_end=clip.frame_range[1]
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=True
bpy.context.scene.render.fps=24
bpy.ops.object.select_all(action='DESELECT');model.select_set(True);rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(root/'assets/pigeon/pigeon.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_skins=True,export_yup=True,export_materials='EXPORT',export_all_vertex_colors=True)
print('PIGEON EXPORT',len(model.data.polygons),'polygons',len(rig.data.bones),'bones',[(a.name,tuple(a.frame_range)) for a in clips])
