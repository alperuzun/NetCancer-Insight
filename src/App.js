import React, { useState } from 'react';
import {PanelGroup, Panel, PanelResizeHandle} from "react-resizable-panels";
import DataPreprocessing from "./DataPreprocessing";
import ForceGraph from "./ForceGraph";
import ComparativeAnalysis from "./ComparativeAnalysis";
import Navbar from "./NavBar";
import {HashRouter as Router, Routes, Route} from 'react-router-dom';
import HomePage from "./HomePage";
import Program from "./Program";


const App = () => {
        return (
            <Router>
                <Routes>
                    <Route path="/" element={<HomePage/>}/>
                    <Route path="/program" element={<Program/>}/>
                </Routes>
            </Router>

        );
};

export default App;

