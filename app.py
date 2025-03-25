import os
import logging
import uuid
from flask import Flask, render_template, request, jsonify, session
import google.generativeai as genai
from datetime import datetime
from models import db, Conversation, Message

# Configure logging
logging.basicConfig(level=logging.DEBUG)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "default_secret_key")

# Configure the database
database_url = os.environ.get("DATABASE_URL")
if not database_url:
    # Fallback to a local SQLite database if no DATABASE_URL is provided
    database_url = "sqlite:///edubuddy.db"
    logging.warning(f"DATABASE_URL not found, using fallback SQLite database: {database_url}")

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# Initialize Google Gemini API
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
genai.configure(api_key=GOOGLE_API_KEY)

# Create database tables
with app.app_context():
    db.create_all()

# Log available models for debugging
try:
    available_models = genai.list_models()
    logging.info("Available models:")
    for model_info in available_models:
        logging.info(f"- {model_info.name}")
except Exception as e:
    logging.error(f"Error listing models: {str(e)}")

# Configure the model with better parameters for educational responses
generation_config = {
    "temperature": 0.7,  # Balanced creativity and coherence
    "top_p": 0.95,
    "top_k": 40,  # Increased from 0 for more diverse responses
    "max_output_tokens": 4096,  # Increased for more comprehensive answers
}

# Use the correct model name format based on available models
model = genai.GenerativeModel(
    model_name="models/gemini-1.5-pro",  # Confirmed available model
    generation_config=generation_config
)

# Base AI mentor system prompt with educational focus
BASE_MENTOR_PROMPT = """You are an AI mentor specialized in quality education. You provide structured responses with step-by-step explanations, real-world analogies, and interactive learning techniques. If a question is unclear, you ask for clarification before responding.

Remember to:
1. Format your responses in Markdown to enhance readability
2. Use **bold text** for important points and headings
3. Create numbered lists for steps or bullet points for key concepts
4. Include code blocks where appropriate using ```language
5. Provide real-world examples that make complex topics relatable
6. Keep answers concise but thorough
7. Maintain a friendly, encouraging tone in your responses

Use a structured approach in your responses with clear headings, examples, and explanations.
Write your response in chunks, one paragraph or section at a time, to make it more readable.
"""

# Persona-specific prompts
PERSONA_PROMPTS = {
    "code": """You are a programming mentor with expertise across multiple languages and paradigms. Focus on:
- Writing clean, efficient, and well-documented code
- Following best practices and design patterns
- Explaining complex programming concepts clearly
- Debugging and troubleshooting methodically
- Suggesting optimizations and improvements

Use code examples liberally to illustrate concepts, always with syntax highlighting.
Include comments in your code examples to explain the approach.
When explaining programming concepts, relate them to real-world applications.
""",
    
    "stem": """You are a STEM education specialist with expertise in science, technology, engineering, and mathematics. Focus on:
- Breaking down complex scientific and mathematical concepts into understandable terms
- Using analogies to relate abstract concepts to everyday experiences
- Providing clear step-by-step explanations for problem-solving
- Including relevant formulas and equations with proper notation
- Relating theoretical concepts to practical applications

Use mathematical notation when appropriate, formatted clearly in Markdown.
When explaining scientific concepts, connect them to observable phenomena when possible.
For complex topics, build understanding progressively from fundamentals to advanced concepts.
""",
    
    "business": """You are a business and management advisor with expertise across various domains of business. Focus on:
- Applying theoretical business concepts to real-world scenarios
- Supporting explanations with relevant case studies and examples
- Analyzing business problems systematically
- Providing actionable insights and practical advice
- Considering different stakeholder perspectives

Frame your explanations in terms of business value and outcomes.
Include relevant business metrics and KPIs when appropriate.
Discuss both strategic and operational implications when analyzing business topics.
Reference current business trends and practices in your responses.
""",
    
    "general": """You are a general education mentor with broad knowledge across humanities, arts, social sciences, and everyday topics. Focus on:
- Making complex topics accessible and engaging
- Drawing connections across different fields of knowledge
- Providing historical context and cultural perspectives
- Encouraging critical thinking and different viewpoints
- Relating academic concepts to practical life applications

Use storytelling approaches when appropriate to make concepts more relatable.
Include cultural and historical context to enrich understanding.
Present multiple perspectives on topics that have different interpretations.
Break down complex ideas into digestible, interconnected concepts.
"""
}

# Action-specific prompts for each persona
ACTION_PROMPTS = {
    "code": {
        "debug": "Analyze this code carefully for errors, bugs, and logical issues. Provide a detailed explanation of each problem found, why it's problematic, and how to fix it. Include corrected code examples.",
        "optimize": "Analyze this code for performance improvements, better algorithms, and efficiency gains. Suggest specific optimizations with examples and explain the benefits of each change.",
        "explain": "Break down this code line by line, explaining the purpose, functionality, and concepts involved. Include explanations of any algorithms, patterns, or techniques used.",
        "best-practices": "Evaluate this code according to industry best practices and standards. Suggest improvements for readability, maintainability, and adherence to conventions. Provide example refactoring."
    },
    "stem": {
        "formula": "Create a comprehensive formula sheet for this topic, clearly presenting all relevant equations, variables, units, and conditions of application. Include brief descriptions of what each formula calculates.",
        "simplify": "Explain this complex concept in simplified terms, using analogies, visual descriptions, and everyday examples. Break it down step by step, starting from first principles.",
        "examples": "Provide multiple worked examples demonstrating this concept in action, with varying levels of complexity. Show the step-by-step solution process for each example.",
        "quiz": "Create a series of conceptual and computational questions that test understanding of this topic, from basic to advanced. Include answers with detailed explanations."
    },
    "business": {
        "case-studies": "Analyze this business concept through 2-3 relevant real-world case studies. For each case, explain the context, application of the concept, outcomes, and key lessons learned.",
        "trends": "Provide an analysis of current trends in this business area, including emerging practices, shifting paradigms, and future predictions. Support with specific industry examples.",
        "analysis": "Conduct a systematic analysis of this business situation, considering market factors, stakeholders, risks, opportunities, and potential strategies. Use appropriate business frameworks.",
        "strategy": "Develop a strategic approach to this business challenge, outlining possible courses of action, their pros and cons, implementation considerations, and success metrics."
    },
    "general": {
        "summary": "Create a comprehensive yet concise summary of this topic, highlighting key points, main ideas, and essential concepts. Structure the summary for easy understanding and reference.",
        "explain": "Explain this concept in simple, accessible language that anyone could understand, regardless of background knowledge. Use concrete examples and everyday analogies.",
        "resources": "Recommend a curated set of learning resources for this topic, such as books, articles, videos, courses, and websites. Include a brief description of each and why it's valuable.",
        "visualize": "Describe how this concept could be visualized or represented graphically. Create a verbal description of diagrams, charts, or illustrations that would make this topic clearer."
    }
}

def get_or_create_session_id():
    """Get the existing session ID or create a new one"""
    if 'session_id' not in session:
        session['session_id'] = str(uuid.uuid4())
    return session['session_id']

def get_or_create_conversation():
    """Get the existing conversation or create a new one"""
    session_id = get_or_create_session_id()
    
    # Try to find the existing conversation
    conversation = Conversation.query.filter_by(session_id=session_id).first()
    
    # If no conversation exists, create a new one
    if not conversation:
        conversation = Conversation(session_id=session_id)
        db.session.add(conversation)
        db.session.commit()
        logging.info(f"Created new conversation with ID: {conversation.id}")
    
    return conversation

def get_chat_history():
    """Retrieve chat history from database"""
    try:
        # Get the conversation
        conversation = get_or_create_conversation()
        
        # Get messages, ordered by timestamp
        messages = Message.query.filter_by(conversation_id=conversation.id).order_by(Message.timestamp).all()
        
        # Format messages for use in the application
        history = [message.to_dict() for message in messages]
        
        # If no messages exist yet, return an empty list
        if not history:
            return []
            
        return history
    except Exception as e:
        logging.error(f"Error getting chat history: {str(e)}")
        # Rollback the session in case of error
        db.session.rollback()
        # Fallback to session if database fails
        if 'chat_history' not in session:
            session['chat_history'] = []
        return session['chat_history']

def get_current_persona():
    """Retrieve current persona from database or return the default"""
    try:
        conversation = get_or_create_conversation()
        if conversation.persona:
            return conversation.persona
        return 'general'
    except Exception as e:
        logging.error(f"Error getting current persona: {str(e)}")
        # Rollback the session in case of error
        db.session.rollback()
        # Fallback to session if database fails
        return session.get('persona', 'general')

def set_persona(persona):
    """Set the current persona in the database"""
    if persona in PERSONA_PROMPTS:
        try:
            conversation = get_or_create_conversation()
            conversation.persona = persona
            db.session.commit()
            # Also update session as fallback
            session['persona'] = persona
            return True
        except Exception as e:
            logging.error(f"Error setting persona in database: {str(e)}")
            # Rollback the session in case of error
            db.session.rollback()
            # Fallback to session if database fails
            session['persona'] = persona
            return True
    return False

def get_prompt_for_persona(persona):
    """Get the appropriate prompt for the selected persona"""
    if persona in PERSONA_PROMPTS:
        return f"{BASE_MENTOR_PROMPT}\n\n{PERSONA_PROMPTS[persona]}"
    return BASE_MENTOR_PROMPT

def update_chat_history(role, content):
    """Add a new message to the chat history in the database"""
    try:
        # Get the conversation
        conversation = get_or_create_conversation()
        
        # Create a new message
        message = Message(
            conversation_id=conversation.id,
            role=role,
            content=content
        )
        
        # Add and commit to database
        db.session.add(message)
        db.session.commit()
        
        # Update the conversation's updated_at timestamp
        conversation.updated_at = datetime.utcnow()
        db.session.commit()
        
        # Also update session as fallback
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        if 'chat_history' not in session:
            session['chat_history'] = []
            
        session['chat_history'].append({
            'role': role, 
            'content': content,
            'timestamp': timestamp
        })
        
        # Get the updated history
        return get_chat_history()
        
    except Exception as e:
        logging.error(f"Error updating chat history in database: {str(e)}")
        # Rollback the session in case of error
        db.session.rollback()
        
        # Fallback to session if database fails
        history = session.get('chat_history', [])
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        history.append({
            'role': role, 
            'content': content,
            'timestamp': timestamp
        })
        
        # Keep only the last 10 messages for context when using session
        if len(history) > 10:
            history.pop(0)
        
        session['chat_history'] = history
        return history

def generate_response(user_message, action=None):
    """Generate a response using Google Gemini and conversation history"""
    try:
        # Update history with new user message
        update_chat_history('user', user_message)
        history = get_chat_history()
        
        # Get the current persona
        persona = get_current_persona()
        
        # Format conversation history for the model
        formatted_history = ""
        
        # Add previous conversation context (only include the last 5 turns)
        recent_history = history[-5:] if len(history) > 5 else history
        for msg in recent_history:
            if msg['role'] == 'user':
                formatted_history += f"User: {msg['content']}\n\n"
            else:  # assistant
                formatted_history += f"AI Mentor: {msg['content']}\n\n"
        
        # Get the appropriate prompt for the persona
        persona_prompt = get_prompt_for_persona(persona)
        
        # Create the complete prompt with system instructions, history and current user message
        complete_prompt = f"{persona_prompt}\n\n"
        
        if len(history) > 1:  # If there's conversation history
            complete_prompt += f"Previous conversation:\n{formatted_history}\n"
        
        # Add action-specific instructions if applicable
        if action and persona in ACTION_PROMPTS and action in ACTION_PROMPTS[persona]:
            action_instruction = ACTION_PROMPTS[persona][action]
            complete_prompt += f"User's latest question: {user_message}\n\n"
            complete_prompt += f"Special instruction: {action_instruction}\n\n"
        else:
            complete_prompt += f"User's latest question: {user_message}\n\n"
        
        complete_prompt += f"Respond as the AI Mentor with the {persona} specialization:"
        
        # Generate the response
        response = model.generate_content(complete_prompt)
        assistant_message = response.text
        
        # Update history with assistant's response
        update_chat_history('assistant', assistant_message)
        
        return assistant_message
        
    except Exception as e:
        logging.error(f"Error generating response: {str(e)}")
        return f"I apologize, but I encountered an error while processing your request. Please try again or rephrase your question. Error details: {str(e)}"

@app.route('/')
def index():
    """Render the main chat interface"""
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    """Handle chat API requests to Google Gemini"""
    try:
        data = request.json
        user_message = data.get('message', '')
        persona = data.get('persona')
        action = data.get('action')
        
        if not user_message:
            return jsonify({'error': 'Message is required'}), 400
        
        # Set persona if provided
        if persona:
            if not set_persona(persona):
                return jsonify({'error': 'Invalid persona'}), 400
        
        # Generate response using the conversation history
        assistant_message = generate_response(user_message, action)
        
        return jsonify({
            'response': assistant_message,
            'persona': get_current_persona()
        })
        
    except Exception as e:
        logging.error(f"Error processing chat request: {str(e)}")
        return jsonify({'error': f'Failed to get response: {str(e)}'}), 500

@app.route('/api/reset', methods=['POST'])
def reset_conversation():
    """Reset the conversation history"""
    try:
        # Get the session ID
        session_id = get_or_create_session_id()
        
        # Find the conversation in the database
        conversation = Conversation.query.filter_by(session_id=session_id).first()
        
        if conversation:
            # Delete all messages associated with this conversation
            Message.query.filter_by(conversation_id=conversation.id).delete()
            
            # Reset the persona
            conversation.persona = None
            
            # Commit changes
            db.session.commit()
            logging.info(f"Cleared database messages for conversation ID: {conversation.id}")
        
        # Also clear session data as a fallback
        if 'chat_history' in session:
            session.pop('chat_history')
        if 'persona' in session:
            session.pop('persona')
            
        return jsonify({'success': True, 'message': 'Conversation history cleared'})
    except Exception as e:
        logging.error(f"Error resetting conversation: {str(e)}")
        # Rollback the session in case of error
        db.session.rollback()
        return jsonify({'error': f'Failed to reset conversation: {str(e)}'}), 500

@app.route('/api/persona', methods=['POST'])
def set_chat_persona():
    """Set the chatbot persona"""
    try:
        data = request.json
        persona = data.get('persona')
        
        if not persona:
            return jsonify({'error': 'Persona is required'}), 400
        
        if not set_persona(persona):
            return jsonify({'error': 'Invalid persona'}), 400
        
        return jsonify({
            'success': True, 
            'message': f'Persona set to {persona}',
            'persona': persona
        })
        
    except Exception as e:
        logging.error(f"Error setting persona: {str(e)}")
        # Rollback the session in case of error
        db.session.rollback()
        return jsonify({'error': f'Failed to set persona: {str(e)}'}), 500

@app.route('/api/history', methods=['GET'])
def get_conversation_history():
    """Get the conversation history"""
    try:
        # Get the conversation history
        history = get_chat_history()
        
        # Get current persona
        persona = get_current_persona()
        
        return jsonify({
            'success': True,
            'history': history,
            'persona': persona
        })
    except Exception as e:
        logging.error(f"Error getting conversation history: {str(e)}")
        # Rollback the session in case of error
        db.session.rollback()
        return jsonify({'error': f'Failed to get conversation history: {str(e)}'}), 500

# Error handlers
@app.errorhandler(404)
def page_not_found(e):
    return render_template('index.html'), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500
