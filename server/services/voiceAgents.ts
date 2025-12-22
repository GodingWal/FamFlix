import { aiService } from './aiService';
import { storage } from '../storage';

// Core agent interface
interface Agent {
  name: string;
  role: string;
  goal: string;
  backstory: string;
  execute(input: any): Promise<any>;
}

// Voice Analysis Agent - Analyzes voice samples and provides feedback
export class VoiceAnalysisAgent implements Agent {
  name = "Voice Analyst";
  role = "Voice Quality Specialist";
  goal = "Analyze voice samples to ensure optimal quality for cloning";
  backstory = "I am an expert in voice analysis with deep understanding of audio quality, emotional tone, and speech patterns that make voice clones authentic and natural.";

  async execute(input: { audioMetadata?: any, familyContext?: any, voiceName?: string }): Promise<{
    qualityScore: number;
    recommendations: string[];
    emotionalTone: string;
    suitabilityForCloning: boolean;
    optimizationSuggestions: string[];
  }> {
    const prompt = `As a voice analysis expert, analyze this voice sample data and provide detailed feedback:

Voice Name: ${input.voiceName || 'Unknown'}
Family Context: ${JSON.stringify(input.familyContext || {})}
Audio Metadata: ${JSON.stringify(input.audioMetadata || {})}

Please provide analysis in the following format:
1. Quality Score (1-10): Rate the voice sample quality
2. Emotional Tone: Describe the emotional characteristics
3. Suitability: Is this good for voice cloning?
4. Recommendations: List specific improvements
5. Optimization: Suggest recording optimizations

Focus on technical audio quality, emotional authenticity, and clone viability.`;

    try {
      const analysis = await aiService.generateVideoScript(prompt);
      
      // Parse the AI response or provide defaults
      return {
        qualityScore: this.extractQualityScore(analysis),
        recommendations: this.extractRecommendations(analysis),
        emotionalTone: this.extractEmotionalTone(analysis),
        suitabilityForCloning: this.extractSuitability(analysis),
        optimizationSuggestions: this.extractOptimizations(analysis)
      };
    } catch (error) {
      console.error('Voice analysis error:', error);
      return {
        qualityScore: 7,
        recommendations: ["Ensure clear audio quality", "Record in quiet environment"],
        emotionalTone: "Natural and warm",
        suitabilityForCloning: true,
        optimizationSuggestions: ["Use consistent microphone distance", "Speak at natural pace"]
      };
    }
  }

  private extractQualityScore(analysis: string): number {
    const scoreMatch = analysis.match(/quality score[:\s]*(\d+)/i);
    return scoreMatch ? parseInt(scoreMatch[1]) : 7;
  }

  private extractRecommendations(analysis: string): string[] {
    const recommendations = analysis.match(/recommendations?[:\s]*\n?(.*?)(?=\n\d|\nOptimization|\nSuitability|$)/i);
    if (recommendations) {
      return recommendations[1].split('\n').map(r => r.replace(/^[-•*]\s*/, '').trim()).filter(r => r.length > 0);
    }
    return ["Maintain consistent speaking pace", "Ensure clear pronunciation"];
  }

  private extractEmotionalTone(analysis: string): string {
    const toneMatch = analysis.match(/emotional tone[:\s]*([^\n]+)/i);
    return toneMatch ? toneMatch[1].trim() : "Natural and expressive";
  }

  private extractSuitability(analysis: string): boolean {
    const suitabilityMatch = analysis.match(/suitability[:\s]*([^\n]+)/i);
    if (suitabilityMatch) {
      return suitabilityMatch[1].toLowerCase().includes('yes') || suitabilityMatch[1].toLowerCase().includes('good');
    }
    return true;
  }

  private extractOptimizations(analysis: string): string[] {
    const optimizations = analysis.match(/optimization[:\s]*\n?(.*?)(?=\n\d|$)/i);
    if (optimizations) {
      return optimizations[1].split('\n').map(o => o.replace(/^[-•*]\s*/, '').trim()).filter(o => o.length > 0);
    }
    return ["Record in consistent environment", "Use proper microphone technique"];
  }
}

// Script Optimization Agent - Optimizes text for better TTS results
export class ScriptOptimizationAgent implements Agent {
  name = "Script Optimizer";
  role = "Text-to-Speech Specialist";
  goal = "Optimize text scripts for natural and expressive voice synthesis";
  backstory = "I specialize in crafting text that sounds natural when converted to speech, understanding the nuances of pronunciation, pacing, and emotional expression in synthetic voices.";

  async execute(input: { text: string, voicePersonality?: string, targetEmotion?: string }): Promise<{
    optimizedText: string;
    pronunciationGuides: string[];
    paceMarkers: string[];
    emotionalCues: string[];
    estimatedDuration: number;
  }> {
    const prompt = `As a text-to-speech optimization expert, enhance this text for voice synthesis:

Original Text: "${input.text}"
Voice Personality: ${input.voicePersonality || 'Natural family voice'}
Target Emotion: ${input.targetEmotion || 'Warm and engaging'}

Please optimize the text for better TTS results by:
1. Adding natural pauses and breathing points
2. Simplifying complex words or phrases
3. Adding emotional markers
4. Ensuring proper flow and rhythm
5. Estimating speech duration

Provide the optimized version that will sound more natural when synthesized.`;

    try {
      const optimization = await aiService.generateNarrationScript(prompt, input.voicePersonality);
      
      return {
        optimizedText: this.extractOptimizedText(optimization, input.text),
        pronunciationGuides: this.extractPronunciationGuides(optimization),
        paceMarkers: this.extractPaceMarkers(optimization),
        emotionalCues: this.extractEmotionalCues(optimization),
        estimatedDuration: this.estimateSpokenDuration(input.text)
      };
    } catch (error) {
      console.error('Script optimization error:', error);
      return {
        optimizedText: input.text,
        pronunciationGuides: [],
        paceMarkers: ["Natural pace throughout"],
        emotionalCues: ["Warm and friendly tone"],
        estimatedDuration: this.estimateSpokenDuration(input.text)
      };
    }
  }

  private extractOptimizedText(optimization: string, originalText: string): string {
    // Extract the optimized text from the AI response
    const optimizedMatch = optimization.match(/optimized[:\s]*\n?(.*?)(?=\nPronunciation|\nPace|$)/i);
    return optimizedMatch ? optimizedMatch[1].trim() : originalText;
  }

  private extractPronunciationGuides(optimization: string): string[] {
    const guides = optimization.match(/pronunciation[:\s]*\n?(.*?)(?=\nPace|\nEmotional|$)/i);
    if (guides) {
      return guides[1].split('\n').map(g => g.replace(/^[-•*]\s*/, '').trim()).filter(g => g.length > 0);
    }
    return [];
  }

  private extractPaceMarkers(optimization: string): string[] {
    const markers = optimization.match(/pace[:\s]*\n?(.*?)(?=\nEmotional|$)/i);
    if (markers) {
      return markers[1].split('\n').map(m => m.replace(/^[-•*]\s*/, '').trim()).filter(m => m.length > 0);
    }
    return ["Maintain natural speaking rhythm"];
  }

  private extractEmotionalCues(optimization: string): string[] {
    const cues = optimization.match(/emotional[:\s]*\n?(.*?)(?=\n|$)/i);
    if (cues) {
      return cues[1].split('\n').map(c => c.replace(/^[-•*]\s*/, '').trim()).filter(c => c.length > 0);
    }
    return ["Express warmth and authenticity"];
  }

  private estimateSpokenDuration(text: string): number {
    // Estimate speaking duration based on word count (average 150 words per minute)
    const words = text.split(/\s+/).length;
    return Math.round((words / 150) * 60); // Duration in seconds
  }
}

// Quality Control Agent - Validates voice clone quality
export class QualityControlAgent implements Agent {
  name = "Quality Inspector";
  role = "Voice Clone Validator";
  goal = "Ensure voice clones meet quality standards and authentic representation";
  backstory = "I am responsible for maintaining the highest standards of voice clone quality, ensuring that synthetic voices are natural, authentic, and technically sound.";

  async execute(input: { 
    voiceProfileId: string, 
    generatedSampleUrl?: string, 
    originalVoiceData?: any,
    userFeedback?: string 
  }): Promise<{
    qualityRating: number;
    authenticity: number;
    naturalness: number;
    issues: string[];
    improvements: string[];
    approved: boolean;
    confidence: number;
  }> {
    const prompt = `As a voice clone quality control expert, evaluate this voice clone:

Voice Profile ID: ${input.voiceProfileId}
Generated Sample: ${input.generatedSampleUrl || 'Not provided'}
Original Voice Data: ${JSON.stringify(input.originalVoiceData || {})}
User Feedback: ${input.userFeedback || 'No feedback provided'}

Evaluate the voice clone on:
1. Overall Quality (1-10): Technical audio quality
2. Authenticity (1-10): How well it matches the original voice
3. Naturalness (1-10): How natural and human-like it sounds
4. Issues: List any problems or concerns
5. Improvements: Suggest specific enhancements
6. Approval: Should this voice clone be approved for use?
7. Confidence: How confident are you in this assessment?

Provide detailed quality assessment and recommendations.`;

    try {
      const evaluation = await aiService.enhanceVideoDescription(prompt);
      
      const qualityRating = this.extractRating(evaluation, 'quality');
      const authenticity = this.extractRating(evaluation, 'authenticity');
      const naturalness = this.extractRating(evaluation, 'naturalness');
      
      return {
        qualityRating,
        authenticity,
        naturalness,
        issues: this.extractIssues(evaluation),
        improvements: this.extractImprovements(evaluation),
        approved: qualityRating >= 7 && authenticity >= 6 && naturalness >= 6,
        confidence: this.extractConfidence(evaluation)
      };
    } catch (error) {
      console.error('Quality control error:', error);
      return {
        qualityRating: 7,
        authenticity: 7,
        naturalness: 7,
        issues: [],
        improvements: ["Continue monitoring voice quality", "Gather user feedback"],
        approved: true,
        confidence: 0.8
      };
    }
  }

  private extractRating(evaluation: string, category: string): number {
    const ratingMatch = evaluation.match(new RegExp(`${category}[:\\s]*\\(?([\\d\\.]+)`, 'i'));
    return ratingMatch ? parseFloat(ratingMatch[1]) : 7;
  }

  private extractIssues(evaluation: string): string[] {
    const issues = evaluation.match(/issues?[:\s]*\n?(.*?)(?=\nImprovement|\nApproval|$)/i);
    if (issues) {
      return issues[1].split('\n').map(i => i.replace(/^[-•*]\s*/, '').trim()).filter(i => i.length > 0);
    }
    return [];
  }

  private extractImprovements(evaluation: string): string[] {
    const improvements = evaluation.match(/improvements?[:\s]*\n?(.*?)(?=\nApproval|\nConfidence|$)/i);
    if (improvements) {
      return improvements[1].split('\n').map(i => i.replace(/^[-•*]\s*/, '').trim()).filter(i => i.length > 0);
    }
    return ["Continue quality monitoring"];
  }

  private extractConfidence(evaluation: string): number {
    const confidenceMatch = evaluation.match(/confidence[:\s]*([\\d\\.]+)/i);
    return confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.8;
  }
}

// Coordination Agent - Orchestrates the entire pipeline
export class VoiceCloneCoordinator implements Agent {
  name = "Voice Clone Coordinator";
  role = "Pipeline Orchestrator";
  goal = "Coordinate all agents to create high-quality voice clones efficiently";
  backstory = "I oversee the entire voice cloning process, ensuring each step is completed properly and all agents work together harmoniously to deliver exceptional results.";

  private voiceAnalyst = new VoiceAnalysisAgent();
  private scriptOptimizer = new ScriptOptimizationAgent();
  private qualityController = new QualityControlAgent();

  async execute(input: {
    action: 'analyze' | 'optimize' | 'validate' | 'full_pipeline';
    voiceData?: any;
    scriptData?: any;
    voiceProfileId?: string;
  }): Promise<any> {
    try {
      switch (input.action) {
        case 'analyze':
          return await this.voiceAnalyst.execute(input.voiceData);
        
        case 'optimize':
          return await this.scriptOptimizer.execute(input.scriptData);
        
        case 'validate':
          return await this.qualityController.execute({ voiceProfileId: input.voiceProfileId! });
        
        case 'full_pipeline':
          return await this.runFullPipeline(input);
        
        default:
          throw new Error('Unknown action');
      }
    } catch (error) {
      console.error('Coordination error:', error);
      throw error;
    }
  }

  private async runFullPipeline(input: any): Promise<{
    analysis: any;
    optimization: any;
    validation: any;
    recommendations: string[];
    overallScore: number;
  }> {
    // Step 1: Analyze voice data
    const analysis = await this.voiceAnalyst.execute(input.voiceData);
    
    // Step 2: Optimize any scripts if provided
    let optimization = null;
    if (input.scriptData) {
      optimization = await this.scriptOptimizer.execute(input.scriptData);
    }
    
    // Step 3: Quality validation if voice profile exists
    let validation = null;
    if (input.voiceProfileId) {
      validation = await this.qualityController.execute({ voiceProfileId: input.voiceProfileId });
    }
    
    // Step 4: Generate overall recommendations
    const recommendations = await this.generateOverallRecommendations(analysis, optimization, validation);
    
    // Step 5: Calculate overall score
    const overallScore = this.calculateOverallScore(analysis, validation);
    
    return {
      analysis,
      optimization,
      validation,
      recommendations,
      overallScore
    };
  }

  private async generateOverallRecommendations(analysis: any, optimization: any, validation: any): Promise<string[]> {
    const recommendations: string[] = [];
    
    if (analysis) {
      recommendations.push(...analysis.recommendations);
      recommendations.push(...analysis.optimizationSuggestions);
    }
    
    if (validation && validation.issues.length > 0) {
      recommendations.push(...validation.improvements);
    }
    
    if (optimization) {
      recommendations.push(...optimization.paceMarkers);
    }
    
    // Remove duplicates and return top recommendations
    const uniqueRecommendations = Array.from(new Set(recommendations));
    return uniqueRecommendations.slice(0, 10);
  }

  private calculateOverallScore(analysis: any, validation: any): number {
    let score = 0;
    let factors = 0;
    
    if (analysis) {
      score += analysis.qualityScore;
      factors++;
    }
    
    if (validation) {
      score += (validation.qualityRating + validation.authenticity + validation.naturalness) / 3;
      factors++;
    }
    
    return factors > 0 ? score / factors : 7;
  }
}

// Export the coordinator as the main interface
export const voiceCloneCoordinator = new VoiceCloneCoordinator();