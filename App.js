import React from 'react';
import {Modal,ScrollView,Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {StatusBar} from 'expo-status-bar';
import {Provider,useStore} from './src/store';
import {Resumen,Gastos,Tarjetas,Planificar,Mas,CATS} from './src/screens';
import {Card,Form,Mu,money,C} from './src/ui';
const Tab=createBottomTabNavigator();
// Bandeja obligatoria: no se puede cerrar hasta categorizar todo
function Pendientes(){const{S,A}=useStore();
 const sp=[['eq','50 / 50'],['prop','Proporcional'],['p0','Solo '+S.names[0]],['p1','Solo '+S.names[1]]];
 return <Modal visible={S.inbox.length>0} animationType='slide' onRequestClose={()=>{}}>
  <ScrollView style={{backgroundColor:C.bg}} contentContainerStyle={{padding:16,paddingTop:56}}>
   <Text style={{fontSize:20,fontWeight:'700',color:C.tx}}>Tenés {S.inbox.length} movimiento(s) sin categoría</Text><Mu>Categorizalos para seguir usando la app.</Mu>
   {S.inbox.map(m=><Card key={m.id} t={`${m.desc} · ${money(m.amt)}`}><Mu>{m.src} · {m.date}</Mu>
    <Form cta='Guardar' fields={[{k:'cat',l:'Categoría',t:'sel',o:CATS.map(c=>[c,c])},{k:'payer',l:'Pagó',t:'sel',o:S.names.map((n,i)=>[i,n])},{k:'split',l:'División',t:'sel',o:sp}]}
     onSubmit={v=>A.categorize(m,{cat:v.cat,payer:Number(v.payer),split:v.split})}/></Card>)}
  </ScrollView></Modal>}
export default function App(){return <Provider><NavigationContainer><StatusBar style='dark'/>
 <Tab.Navigator screenOptions={{tabBarActiveTintColor:C.ac}}>
  <Tab.Screen name='Resumen' component={Resumen}/><Tab.Screen name='Gastos' component={Gastos}/><Tab.Screen name='Tarjetas' component={Tarjetas}/>
  <Tab.Screen name='Planificar' component={Planificar}/><Tab.Screen name='Más' component={Mas}/></Tab.Navigator><Pendientes/></NavigationContainer></Provider>}
