from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

# Initialize SQLAlchemy without explicitly binding it to an app yet
db = SQLAlchemy()

class Conversation(db.Model):
    """Model for storing conversation sessions"""
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(255), unique=True, nullable=False)
    persona = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship
    messages = db.relationship('Message', backref='conversation', lazy=True, cascade="all, delete-orphan")
    
    def __repr__(self):
        return f'<Conversation {self.id}: {self.persona}>'


class Message(db.Model):
    """Model for storing individual messages in a conversation"""
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'user' or 'assistant'
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<Message {self.id}: {self.role[:10]}...>'
    
    def to_dict(self):
        """Convert message to dictionary format for the UI"""
        return {
            'role': self.role,
            'content': self.content,
            'timestamp': self.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        }